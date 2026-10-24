// src/types/app.types.ts
import { Judge, Organisation } from './database.types';

export type AuthRole = 'guest' | 'judge' | 'organiser';

export interface AuthState {
  role: AuthRole;
  user: Judge | Organisation | null;
  sessionToken: string | null;
  loginAsJudge: (judge: Judge, token: string) => void;
  loginAsOrganiser: (org: Organisation, token: string) => void;
  logout: () => void;
}

export interface SyncQueueState {
  pendingSubmissions: number; // Count of scores waiting for internet
  isOnline: boolean;
  setOnlineStatus: (status: boolean) => void;
  addPendingSubmission: () => void;
  flushQueue: () => Promise<void>; // Triggers DB upload when online
}