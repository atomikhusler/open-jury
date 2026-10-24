-- ============================================================================
-- OPEN JURY: PHASE 6 MANUAL TIE-BREAKER RPC & REALTIME EXTENSION
-- ============================================================================

-- 1. Chief Judge Manual Tie-Breaker Override RPC (+0.10 bonus or reset to 0.00)
CREATE OR REPLACE FUNCTION public.apply_manual_tiebreaker(
  p_participant_id UUID,
  p_bonus NUMERIC DEFAULT 0.10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_participant RECORD;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only authenticated organisers can apply a manual tie-breaker.';
  END IF;

  -- Verify the participant belongs to an event owned by this Organiser
  IF NOT EXISTS (
    SELECT 1
    FROM public.participants p
    JOIN public.events e ON e.id = p.event_id
    WHERE p.id = p_participant_id AND e.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: Participant does not belong to your organisation.';
  END IF;

  UPDATE public.participants
  SET manual_tie_break_bonus = ROUND(COALESCE(p_bonus, 0.10)::NUMERIC, 2)
  WHERE id = p_participant_id
  RETURNING * INTO v_participant;

  RETURN row_to_json(v_participant)::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_manual_tiebreaker(UUID, NUMERIC) TO authenticated;

-- 2. Add participants table to Realtime Publication so Live TV sees tie-breaker overrides instantly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
  END IF;
END $$;