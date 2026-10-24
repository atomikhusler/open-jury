// src/store/useAuthStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthState } from '../types/app.types';
import { Judge, Organisation, Event, Criterion, Participant } from '../types/database.types';
import { supabase } from '../core/supabase';
import { useEventStore } from './useEventStore';

interface ExtendedAuthState extends AuthState {
  isLoading: boolean;
  error: string | null;
  authenticateJudgeWithCloud: (
    orgId: string,
    judgeCustomId: string,
    pin: string
  ) => Promise<boolean>;
  signInOrganiserWithCloud: (email: string, password: string) => Promise<boolean>;
  signUpOrganiserWithCloud: (
    orgId: string,
    orgName: string,
    email: string,
    password: string
  ) => Promise<boolean>;
}

export const useAuthStore = create<ExtendedAuthState>()(
  persist(
    (set) => ({
      role: 'guest',
      user: null,
      sessionToken: null,
      isLoading: false,
      error: null,

      // Direct state setters (Preserved for backward compatibility)
      loginAsJudge: (judge, token) =>
        set({ role: 'judge', user: judge, sessionToken: token, error: null }),

      loginAsOrganiser: (org, token) =>
        set({ role: 'organiser', user: org, sessionToken: token, error: null }),

      // Cloud Judge Login via PostgreSQL RPC
      authenticateJudgeWithCloud: async (orgId, judgeCustomId, pin) => {
        set({ isLoading: true, error: null });
        try {
          const cleanOrgId = orgId.trim().toUpperCase();
          const cleanJudgeId = judgeCustomId.trim().toUpperCase();
          const cleanPin = pin.trim();

          const { data, error } = await supabase.rpc('judge_login', {
            p_org_id: cleanOrgId,
            p_judge_custom_id: cleanJudgeId,
            p_pin: cleanPin,
          });

          if (error) throw new Error(error.message);
          if (!data || !data.session_token) {
            throw new Error('Invalid response from authentication server.');
          }

          const judgeProfile: Judge = {
            id: data.judge.id,
            org_id: data.judge.org_id,
            judge_custom_id: data.judge.judge_custom_id,
            pin: '****', // Never persist plaintext PIN in state
            assigned_event_ids: data.judge.assigned_event_ids || [],
          };

          // Hydrate the EventStore with the Judge's assigned events, rubric, and participants
          const events: Event[] = data.events || [];
          const criteria: Criterion[] = data.criteria || [];
          const participants: Participant[] = data.participants || [];
          const submittedIds: string[] = data.submitted_participant_ids || [];

          useEventStore.getState().hydrateFromJudgeLogin({
            events,
            criteria,
            participants,
            submittedParticipantIds: submittedIds,
          });

          set({
            role: 'judge',
            user: judgeProfile,
            sessionToken: data.session_token,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (err: any) {
          set({
            isLoading: false,
            error: err?.message || 'Judge authentication failed.',
          });
          return false;
        }
      },

      // Cloud Organiser Sign-In via Supabase Auth
      signInOrganiserWithCloud: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data: authData, error: authError } =
            await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });

          if (authError) throw new Error(authError.message);
          if (!authData.user || !authData.session) {
            throw new Error('No active session returned.');
          }

          const { data: orgData, error: orgError } = await supabase
            .from('organisations')
            .select('*')
            .eq('owner_user_id', authData.user.id)
            .single();

          if (orgError || !orgData) {
            throw new Error('Organisation profile not found for this account.');
          }

          const organisation: Organisation = {
            id: orgData.id,
            name: orgData.name,
            email: orgData.email,
            created_at: orgData.created_at,
          };

          set({
            role: 'organiser',
            user: organisation,
            sessionToken: authData.session.access_token,
            isLoading: false,
            error: null,
          });

          // Fetch all events, criteria, participants, and scores for this Organisation
          await useEventStore.getState().fetchOrganiserWorkspace(organisation.id);

          return true;
        } catch (err: any) {
          set({
            isLoading: false,
            error: err?.message || 'Organiser sign-in failed.',
          });
          return false;
        }
      },

      // Cloud Organiser Sign-Up (Creates Auth User + Organisation Row)
      signUpOrganiserWithCloud: async (orgId, orgName, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const cleanOrgId = orgId.trim().toUpperCase();
          if (!/^[A-Z]{2}[0-9]{4}$/.test(cleanOrgId)) {
            throw new Error(
              'Organisation ID must be 2 uppercase letters + 4 digits (e.g., OD2026).'
            );
          }

          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

          if (authError) throw new Error(authError.message);
          if (!authData.user || !authData.session) {
            throw new Error(
              'Account created, but session inactive. Ensure "Confirm email" is turned OFF in Supabase Auth settings.'
            );
          }

          const { data: orgData, error: orgError } = await supabase
            .from('organisations')
            .insert({
              id: cleanOrgId,
              owner_user_id: authData.user.id,
              name: orgName.trim() || `Organisation ${cleanOrgId}`,
              email: email.trim(),
            })
            .select()
            .single();

          if (orgError) throw new Error(orgError.message);

          const organisation: Organisation = {
            id: orgData.id,
            name: orgData.name,
            email: orgData.email,
            created_at: orgData.created_at,
          };

          set({
            role: 'organiser',
            user: organisation,
            sessionToken: authData.session.access_token,
            isLoading: false,
            error: null,
          });

          await useEventStore.getState().fetchOrganiserWorkspace(organisation.id);
          return true;
        } catch (err: any) {
          set({
            isLoading: false,
            error: err?.message || 'Organiser registration failed.',
          });
          return false;
        }
      },

      logout: async () => {
        useEventStore.getState().unsubscribeFromRealtime();
        useEventStore.getState().clearEventContext();
        await supabase.auth.signOut().catch(() => {});
        set({ role: 'guest', user: null, sessionToken: null, error: null });
      },
    }),
    {
      name: 'open-jury-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        role: state.role,
        user: state.user,
        sessionToken: state.sessionToken,
      }),
    }
  )
);
