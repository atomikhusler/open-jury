// src/types/database.types.ts

export type EventState = 'draft' | 'active' | 'paused' | 'ended';
export type TieBreakerMethod =
  | 'weighted'
  | 'olympic_trim'
  | 'timestamp'
  | 'shared'
  | 'manual';

export interface Organisation {
  id: string; // e.g., "OD2026"
  name: string;
  email: string;
  created_at: string;
}

export interface Judge {
  id: string; // Internal DB UUID
  org_id: string; // Links to Organisation
  judge_custom_id: string; // e.g., "J1"
  pin: string; // 4-digit hashed PIN
  assigned_event_ids: string[]; // Events they are allowed to score
}

export interface Event {
  id: string;
  org_id: string;
  name: string; // e.g., "Solo Dance"
  state: EventState;
  tie_breaker_method: TieBreakerMethod;
  ranking_enabled?: boolean;
  fair_trim_enabled?: boolean;
  created_at: string;
}

export interface Criterion {
  id: string;
  event_id: string;
  name: string; // e.g., "Expression", "Choreography"
  max_marks: number; // e.g., 5, 10
  is_tie_breaker: boolean; // Only one can be true per event
  order_index: number;
}

export interface Participant {
  id: string;
  event_id: string;
  serial_no: number; // 1, 2, 3...
  name: string;
  class_name?: string;
  school_name: string;
  cluster_name?: string;
  block_name?: string;
  manual_tie_break_bonus?: number; // Default 0.00, +0.10 when Chief Judge breaks a tie
}

export interface ScoreSubmission {
  id: string;
  event_id: string;
  judge_id: string;
  participant_id: string;
  scores: Record<string, number>; // { criterion_id: score_value }
  total_score: number;
  submitted_at: string; // Exact timestamp for tie-breaking
  is_synced: boolean; // Frontend only: Tracks if saved to Supabase or pending
}
