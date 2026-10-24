// src/store/useSyncStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncQueueState } from '../types/app.types';
import { ScoreSubmission } from '../types/database.types';
import { supabase } from '../core/supabase';
import { useAuthStore } from './useAuthStore';

interface ExtendedSyncQueueState extends SyncQueueState {
  queue: ScoreSubmission[];
  isFlushing: boolean;
  enqueueSubmission: (
    submission: Omit<ScoreSubmission, 'is_synced'>
  ) => Promise<{ syncedImmediately: boolean; error?: string }>;
}

export const useSyncStore = create<ExtendedSyncQueueState>()(
  persist(
    (set, get) => ({
      pendingSubmissions: 0,
      isOnline: true,
      queue: [],
      isFlushing: false,

      setOnlineStatus: (status: boolean) => {
        const wasOffline = !get().isOnline;
        set({ isOnline: status });
        if (status && wasOffline && get().queue.length > 0) {
          get().flushQueue();
        }
      },

      // Backward-compatible counter increment
      addPendingSubmission: () =>
        set((state) => ({ pendingSubmissions: state.pendingSubmissions + 1 })),

      // Primary submission pipeline (Online immediate RPC + Offline durable fallback)
      enqueueSubmission: async (submission) => {
        const { isOnline, queue } = get();
        const sessionToken = useAuthStore.getState().sessionToken;

        const fullRecord: ScoreSubmission = {
          ...submission,
          is_synced: false,
        };

        // Always append to durable queue first so power loss/network drop never loses data
        const updatedQueue = [
          ...queue.filter(
            (item) =>
              !(
                item.event_id === fullRecord.event_id &&
                item.participant_id === fullRecord.participant_id &&
                item.judge_id === fullRecord.judge_id
              )
          ),
          fullRecord,
        ];

        set({
          queue: updatedQueue,
          pendingSubmissions: updatedQueue.length,
        });

        // If online and we have a judge session token, flush immediately
        if (isOnline && sessionToken) {
          await get().flushQueue();
          const stillQueued = get().queue.some((item) => item.id === fullRecord.id);
          return { syncedImmediately: !stillQueued };
        }

        return { syncedImmediately: false };
      },

      flushQueue: async () => {
        const { queue, isOnline, isFlushing } = get();
        const sessionToken = useAuthStore.getState().sessionToken;

        if (!isOnline || isFlushing || queue.length === 0 || !sessionToken) {
          return;
        }

        set({ isFlushing: true });
        const remainingQueue: ScoreSubmission[] = [];

        for (const item of queue) {
          try {
            const { error } = await supabase.rpc('submit_immutable_score', {
              p_session_token: sessionToken,
              p_event_id: item.event_id,
              p_participant_id: item.participant_id,
              p_scores: item.scores,
              p_submitted_at: item.submitted_at,
            });

            if (error) {
              console.warn('RPC Score Sync Warning:', error.message);
              // Keep in queue if network/timeout error; drop only if permanent validation error
              if (
                error.message.includes('Failed to fetch') ||
                error.message.includes('Network request failed')
              ) {
                remainingQueue.push(item);
              } else {
                // Keep in queue so nothing is silently lost, but log the rejection reason
                remainingQueue.push(item);
              }
            }
          } catch (networkErr) {
            remainingQueue.push(item);
          }
        }

        set({
          queue: remainingQueue,
          pendingSubmissions: remainingQueue.length,
          isFlushing: false,
        });
      },
    }),
    {
      name: 'open-jury-sync-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        queue: state.queue,
        pendingSubmissions: state.pendingSubmissions,
      }),
    }
  )
);
