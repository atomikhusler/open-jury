-- ============================================================================
-- OPEN JURY: PHASE 5 CRYPTOGRAPHIC VAULT, SCHEMA, RLS & RPC ENGINE
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- 2.1 ORGANISATIONS
CREATE TABLE IF NOT EXISTS public.organisations (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Z]{2}[0-9]{4}$'), -- e.g. "OD2026"
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 EVENTS
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'paused', 'ended')),
  tie_breaker_method TEXT NOT NULL DEFAULT 'weighted' CHECK (
    tie_breaker_method IN ('weighted', 'olympic_trim', 'timestamp', 'shared', 'manual')
  ),
  ranking_enabled BOOLEAN NOT NULL DEFAULT false,
  fair_trim_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 CRITERIA
CREATE TABLE IF NOT EXISTS public.criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_marks INTEGER NOT NULL CHECK (max_marks > 0 AND max_marks <= 100),
  is_tie_breaker BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Guarantee at most ONE tie-breaker criterion per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_tie_breaker_per_event
  ON public.criteria (event_id)
  WHERE is_tie_breaker = true;

-- 2.4 PARTICIPANTS
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  serial_no INTEGER NOT NULL CHECK (serial_no > 0),
  name TEXT NOT NULL,
  class_name TEXT,
  school_name TEXT NOT NULL,
  cluster_name TEXT,
  block_name TEXT,
  manual_tie_break_bonus NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  UNIQUE (event_id, serial_no)
);

-- 2.5 JUDGES
CREATE TABLE IF NOT EXISTS public.judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  judge_custom_id TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  assigned_event_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, judge_custom_id)
);

-- 2.6 JUDGE SESSIONS (Server-side token ledger for passwordless Judge Auth)
CREATE TABLE IF NOT EXISTS public.judge_sessions (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  judge_id UUID NOT NULL REFERENCES public.judges(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- 2.7 SCORE SUBMISSIONS (The Immutable Ledger)
CREATE TABLE IF NOT EXISTS public.score_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  judge_id UUID NOT NULL REFERENCES public.judges(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
  scores JSONB NOT NULL,
  total_score INTEGER NOT NULL CHECK (total_score >= 0),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, judge_id, participant_id)
);

-- ============================================================================
-- 3. IMMUTABILITY & STATE MACHINE TRIGGERS
-- ============================================================================

-- 3.1 Absolute Score Immutability Trigger (No UPDATE or DELETE ever allowed)
CREATE OR REPLACE FUNCTION public.prevent_score_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ZERO_TRUST_VIOLATION: Score submissions are permanently immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_score_tampering ON public.score_submissions;
CREATE TRIGGER trg_prevent_score_tampering
  BEFORE UPDATE OR DELETE ON public.score_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_score_tampering();

-- 3.2 Event State Machine Lock Trigger (Once 'ended', never reopen; once left 'draft', never return to 'draft')
CREATE OR REPLACE FUNCTION public.enforce_event_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'ended' AND NEW.state <> 'ended' THEN
    RAISE EXCEPTION 'STATE_LOCK_VIOLATION: An ended event is permanently locked and cannot be restarted.';
  END IF;

  IF OLD.state <> 'draft' AND NEW.state = 'draft' THEN
    RAISE EXCEPTION 'STATE_LOCK_VIOLATION: An active or paused event cannot revert to draft.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_state_machine ON public.events;
CREATE TRIGGER trg_enforce_event_state_machine
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_state_machine();

-- 3.3 Lock Rubric Modifications Once Event Leaves 'draft'
CREATE OR REPLACE FUNCTION public.enforce_rubric_lock_after_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
  v_event_id UUID;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  SELECT state INTO v_state FROM public.events WHERE id = v_event_id;

  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'RUBRIC_LOCKED: Criteria cannot be added, modified, or deleted once the event has started.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_criteria_after_draft ON public.criteria;
CREATE TRIGGER trg_lock_criteria_after_draft
  BEFORE INSERT OR UPDATE OR DELETE ON public.criteria
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_rubric_lock_after_draft();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_submissions ENABLE ROW LEVEL SECURITY;

-- Helper function: Get current authenticated Organiser's org_id
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organisations WHERE owner_user_id = auth.uid() LIMIT 1;
$$;

-- 4.1 ORGANISATIONS POLICIES
DROP POLICY IF EXISTS "Organisers can view own organisation" ON public.organisations;
CREATE POLICY "Organisers can view own organisation"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Organisers can insert own organisation" ON public.organisations;
CREATE POLICY "Organisers can insert own organisation"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- 4.2 EVENTS POLICIES (Public read for Live TV & Judge sync; Organiser write)
DROP POLICY IF EXISTS "Anyone can read events" ON public.events;
CREATE POLICY "Anyone can read events"
  ON public.events FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Organisers manage own events" ON public.events;
CREATE POLICY "Organisers manage own events"
  ON public.events FOR ALL
  TO authenticated
  USING (org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

-- 4.3 CRITERIA POLICIES
DROP POLICY IF EXISTS "Anyone can read criteria" ON public.criteria;
CREATE POLICY "Anyone can read criteria"
  ON public.criteria FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Organisers manage own criteria" ON public.criteria;
CREATE POLICY "Organisers manage own criteria"
  ON public.criteria FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = criteria.event_id AND e.org_id = public.get_my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = criteria.event_id AND e.org_id = public.get_my_org_id()
    )
  );

-- 4.4 PARTICIPANTS POLICIES
DROP POLICY IF EXISTS "Anyone can read participants" ON public.participants;
CREATE POLICY "Anyone can read participants"
  ON public.participants FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Organisers manage own participants" ON public.participants;
CREATE POLICY "Organisers manage own participants"
  ON public.participants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = participants.event_id AND e.org_id = public.get_my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = participants.event_id AND e.org_id = public.get_my_org_id()
    )
  );

-- 4.5 JUDGES POLICIES (Organiser read/manage; Judge auth uses SECURITY DEFINER RPC)
DROP POLICY IF EXISTS "Organisers view and manage own judges" ON public.judges;
CREATE POLICY "Organisers view and manage own judges"
  ON public.judges FOR ALL
  TO authenticated
  USING (org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

-- 4.6 SCORE SUBMISSIONS POLICIES (Read-only for Organisers/Live TV; INSERT only via RPC; ZERO UPDATE/DELETE)
DROP POLICY IF EXISTS "Public and Organisers can read score submissions" ON public.score_submissions;
CREATE POLICY "Public and Organisers can read score submissions"
  ON public.score_submissions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Notice: NO INSERT, UPDATE, or DELETE policies are granted directly to anon/authenticated on score_submissions.
-- All insertions MUST pass through the cryptographic `submit_immutable_score` RPC below!

-- ============================================================================
-- 5. CRYPTOGRAPHIC RPC FUNCTIONS (Auth, Judge Provisioning & Score Submission)
-- ============================================================================

-- 5.1 Create or Upsert Judge Credential (Called by Organiser)
CREATE OR REPLACE FUNCTION public.upsert_judge_credential(
  p_judge_custom_id TEXT,
  p_pin TEXT,
  p_assigned_event_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_judge RECORD;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only logged-in organisers can provision judges.';
  END IF;

  IF p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_PIN: Judge PIN must be exactly 4 digits.';
  END IF;

  INSERT INTO public.judges (org_id, judge_custom_id, pin_hash, assigned_event_ids)
  VALUES (
    v_org_id,
    UPPER(TRIM(p_judge_custom_id)),
    crypt(p_pin, gen_salt('bf')),
    p_assigned_event_ids
  )
  ON CONFLICT (org_id, judge_custom_id)
  DO UPDATE SET
    pin_hash = crypt(p_pin, gen_salt('bf')),
    assigned_event_ids = EXCLUDED.assigned_event_ids
  RETURNING id, org_id, judge_custom_id, assigned_event_ids, created_at INTO v_judge;

  RETURN jsonb_build_object(
    'id', v_judge.id,
    'org_id', v_judge.org_id,
    'judge_custom_id', v_judge.judge_custom_id,
    'assigned_event_ids', v_judge.assigned_event_ids
  );
END;
$$;

-- 5.2 Passwordless Judge Login (Verifies PIN & issues 24h Session Token + Hydration Payload)
CREATE OR REPLACE FUNCTION public.judge_login(
  p_org_id TEXT,
  p_judge_custom_id TEXT,
  p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_judge RECORD;
  v_token TEXT;
  v_events JSONB;
  v_criteria JSONB;
  v_participants JSONB;
  v_submitted_ids JSONB;
BEGIN
  SELECT * INTO v_judge
  FROM public.judges
  WHERE org_id = UPPER(TRIM(p_org_id))
    AND judge_custom_id = UPPER(TRIM(p_judge_custom_id));

  IF NOT FOUND OR v_judge.pin_hash <> crypt(TRIM(p_pin), v_judge.pin_hash) THEN
    RAISE EXCEPTION 'INVALID_CREDENTIALS: Invalid Organisation ID, Judge ID, or PIN.';
  END IF;

  -- Create a fresh 24-hour session token
  INSERT INTO public.judge_sessions (judge_id, org_id)
  VALUES (v_judge.id, v_judge.org_id)
  RETURNING token INTO v_token;

  -- Fetch assigned events
  SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_events
  FROM public.events e
  WHERE e.id = ANY(v_judge.assigned_event_ids);

  -- Fetch criteria for assigned events
  SELECT COALESCE(jsonb_agg(c ORDER BY c.order_index ASC), '[]'::jsonb)
  INTO v_criteria
  FROM public.criteria c
  WHERE c.event_id = ANY(v_judge.assigned_event_ids);

  -- Fetch participants for assigned events
  SELECT COALESCE(jsonb_agg(p ORDER BY p.serial_no ASC), '[]'::jsonb)
  INTO v_participants
  FROM public.participants p
  WHERE p.event_id = ANY(v_judge.assigned_event_ids);

  -- Fetch participant IDs already scored by this judge (prevents double-scoring across restarts)
  SELECT COALESCE(jsonb_agg(s.participant_id), '[]'::jsonb)
  INTO v_submitted_ids
  FROM public.score_submissions s
  WHERE s.judge_id = v_judge.id;

  RETURN jsonb_build_object(
    'session_token', v_token,
    'judge', jsonb_build_object(
      'id', v_judge.id,
      'org_id', v_judge.org_id,
      'judge_custom_id', v_judge.judge_custom_id,
      'assigned_event_ids', v_judge.assigned_event_ids
    ),
    'events', v_events,
    'criteria', v_criteria,
    'participants', v_participants,
    'submitted_participant_ids', v_submitted_ids
  );
END;
$$;

-- 5.3 Cryptographic Score Submission Gate (Idempotent & Server-Validated)
CREATE OR REPLACE FUNCTION public.submit_immutable_score(
  p_session_token TEXT,
  p_event_id UUID,
  p_participant_id UUID,
  p_scores JSONB,
  p_submitted_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_judge RECORD;
  v_event RECORD;
  v_criterion RECORD;
  v_raw_val TEXT;
  v_mark INTEGER;
  v_calculated_total INTEGER := 0;
  v_criteria_count INTEGER := 0;
  v_existing RECORD;
  v_inserted RECORD;
BEGIN
  -- 1. Validate Judge Session Token
  SELECT * INTO v_session
  FROM public.judge_sessions
  WHERE token = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_EXPIRED: Judge session is invalid or expired. Please log in again.';
  END IF;

  SELECT * INTO v_judge FROM public.judges WHERE id = v_session.judge_id;

  -- 2. Verify Judge is assigned to this event
  IF NOT (p_event_id = ANY(v_judge.assigned_event_ids)) THEN
    RAISE EXCEPTION 'FORBIDDEN_EVENT: Judge is not assigned to this event.';
  END IF;

  -- 3. Idempotency Check (If offline queue retried an already-synced score, return existing record cleanly)
  SELECT * INTO v_existing
  FROM public.score_submissions
  WHERE event_id = p_event_id
    AND judge_id = v_judge.id
    AND participant_id = p_participant_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_recorded',
      'submission', row_to_json(v_existing)
    );
  END IF;

  -- 4. Verify Event State (Must be 'active' - unless queued while active before a pause, still block 'draft' & 'ended')
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND: Target event does not exist.';
  END IF;

  IF v_event.state IN ('draft', 'ended') THEN
    RAISE EXCEPTION 'EVENT_CLOSED: Cannot submit scores when event is in % state.', v_event.state;
  END IF;

  -- 5. Server-Side Rubric & Range Validation
  FOR v_criterion IN
    SELECT * FROM public.criteria WHERE event_id = p_event_id
  LOOP
    v_criteria_count := v_criteria_count + 1;
    v_raw_val := p_scores ->> (v_criterion.id::TEXT);

    IF v_raw_val IS NULL THEN
      RAISE EXCEPTION 'MISSING_CRITERION: Score missing for criterion "%".', v_criterion.name;
    END IF;

    v_mark := v_raw_val::INTEGER;
    IF v_mark < 0 OR v_mark > v_criterion.max_marks THEN
      RAISE EXCEPTION 'OUT_OF_RANGE: Score % for "%" exceeds bounds (0 to %).', v_mark, v_criterion.name, v_criterion.max_marks;
    END IF;

    v_calculated_total := v_calculated_total + v_mark;
  END LOOP;

  IF v_criteria_count = 0 THEN
    RAISE EXCEPTION 'NO_RUBRIC: Event has no configured criteria.';
  END IF;

  -- 6. Perform Immutable Insert
  INSERT INTO public.score_submissions (
    event_id,
    judge_id,
    participant_id,
    scores,
    total_score,
    submitted_at
  )
  VALUES (
    p_event_id,
    v_judge.id,
    p_participant_id,
    p_scores,
    v_calculated_total,
    COALESCE(p_submitted_at, now())
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'status', 'locked',
    'submission', row_to_json(v_inserted)
  );
END;
$$;

-- Grant RPC execution permissions to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.upsert_judge_credential(TEXT, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.judge_login(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_immutable_score(TEXT, UUID, UUID, JSONB, TIMESTAMPTZ) TO anon, authenticated;

-- ============================================================================
-- 6. REALTIME WEBSOCKET PUBLICATION
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'score_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.score_submissions;
  END IF;
END $$;
