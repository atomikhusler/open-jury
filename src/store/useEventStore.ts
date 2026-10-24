// src/store/useEventStore.ts
import { create } from 'zustand';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  Event,
  EventState,
  Participant,
  Criterion,
  ScoreSubmission,
} from '../types/database.types';
import { supabase } from '../core/supabase';

interface EventStore {
  // Phase 3 Judge Terminal Context
  activeEvent: Event | null;
  activeParticipant: Participant | null;
  criteria: Criterion[];
  participants: Participant[];
  submittedParticipantIds: string[];

  // Phase 4 Organiser Multi-Event Ledger
  events: Event[];
  criteriaByEvent: Record<string, Criterion[]>;
  participantsByEvent: Record<string, Participant[]>;
  submissionsByEvent: Record<string, ScoreSubmission[]>;

  // Realtime Channel Reference
  realtimeChannel: RealtimeChannel | null;

  // Phase 3 Actions
  setActiveEvent: (event: Event | null) => void;
  setActiveParticipant: (participant: Participant | null) => void;
  setCriteria: (criteria: Criterion[]) => void;
  setParticipants: (participants: Participant[]) => void;
  markParticipantSubmitted: (participantId: string) => void;
  clearEventContext: () => void;

  // Phase 4 & 5 Cloud-Backed Organiser Actions
  hydrateFromJudgeLogin: (payload: {
    events: Event[];
    criteria: Criterion[];
    participants: Participant[];
    submittedParticipantIds: string[];
  }) => void;
  fetchOrganiserWorkspace: (orgId: string) => Promise<void>;
  createEvent: (
    orgId: string,
    name: string,
    tieBreakerMethod?: Event['tie_breaker_method']
  ) => Promise<Event | null>;
  updateEventState: (eventId: string, nextState: EventState) => Promise<boolean>;
  saveCriteriaForEvent: (
    eventId: string,
    criteriaList: Omit<Criterion, 'id'>[]
  ) => Promise<boolean>;
  bulkImportParticipants: (
    eventId: string,
    newParticipants: Omit<Participant, 'id'>[]
  ) => Promise<boolean>;

  // Phase 5 Realtime WebSocket Engine
  subscribeToEventRealtime: (eventId?: string) => void;
  unsubscribeFromRealtime: () => void;
}

export const useEventStore = create<EventStore>((set, get) => ({
  activeEvent: null,
  activeParticipant: null,
  criteria: [],
  participants: [],
  submittedParticipantIds: [],

  events: [],
  criteriaByEvent: {},
  participantsByEvent: {},
  submissionsByEvent: {},
  realtimeChannel: null,

  setActiveEvent: (event) => {
    if (!event) {
      set({ activeEvent: null, activeParticipant: null, criteria: [], participants: [] });
      return;
    }
    const eventCriteria = get().criteriaByEvent[event.id] || get().criteria;
    const eventParticipants = get().participantsByEvent[event.id] || get().participants;
    set({
      activeEvent: event,
      criteria: eventCriteria,
      participants: eventParticipants,
      activeParticipant: eventParticipants[0] || null,
    });
    get().subscribeToEventRealtime(event.id);
  },

  setActiveParticipant: (participant) => set({ activeParticipant: participant }),

  setCriteria: (criteria) => set({ criteria }),

  setParticipants: (participants) => set({ participants }),

  markParticipantSubmitted: (participantId) =>
    set((state) => ({
      submittedParticipantIds: state.submittedParticipantIds.includes(participantId)
        ? state.submittedParticipantIds
        : [...state.submittedParticipantIds, participantId],
    })),

  clearEventContext: () =>
    set({
      activeEvent: null,
      activeParticipant: null,
      criteria: [],
      participants: [],
      submittedParticipantIds: [],
    }),

  hydrateFromJudgeLogin: ({
    events,
    criteria,
    participants,
    submittedParticipantIds,
  }) => {
    const criteriaByEvent: Record<string, Criterion[]> = {};
    criteria.forEach((c) => {
      if (!criteriaByEvent[c.event_id]) criteriaByEvent[c.event_id] = [];
      criteriaByEvent[c.event_id].push(c);
    });

    const participantsByEvent: Record<string, Participant[]> = {};
    participants.forEach((p) => {
      if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
      participantsByEvent[p.event_id].push(p);
    });

    const firstEvent = events[0] || null;
    const firstParticipants = firstEvent ? participantsByEvent[firstEvent.id] || [] : [];
    const firstCriteria = firstEvent ? criteriaByEvent[firstEvent.id] || [] : [];

    // Find first un-scored participant
    const firstUnscored =
      firstParticipants.find((p) => !submittedParticipantIds.includes(p.id)) ||
      firstParticipants[0] ||
      null;

    set({
      events,
      criteriaByEvent,
      participantsByEvent,
      activeEvent: firstEvent,
      criteria: firstCriteria,
      participants: firstParticipants,
      activeParticipant: firstUnscored,
      submittedParticipantIds,
    });

    if (firstEvent) {
      get().subscribeToEventRealtime(firstEvent.id);
    }
  },

  fetchOrganiserWorkspace: async (orgId) => {
    const { data: eventsData, error: eventsErr } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (eventsErr || !eventsData) return;

    const eventIds = eventsData.map((e) => e.id);
    const criteriaByEvent: Record<string, Criterion[]> = {};
    const participantsByEvent: Record<string, Participant[]> = {};
    const submissionsByEvent: Record<string, ScoreSubmission[]> = {};

    if (eventIds.length > 0) {
      const [criteriaRes, participantsRes, submissionsRes] = await Promise.all([
        supabase
          .from('criteria')
          .select('*')
          .in('event_id', eventIds)
          .order('order_index', { ascending: true }),
        supabase
          .from('participants')
          .select('*')
          .in('event_id', eventIds)
          .order('serial_no', { ascending: true }),
        supabase
          .from('score_submissions')
          .select('*')
          .in('event_id', eventIds)
          .order('submitted_at', { ascending: true }),
      ]);

      (criteriaRes.data || []).forEach((c: Criterion) => {
        if (!criteriaByEvent[c.event_id]) criteriaByEvent[c.event_id] = [];
        criteriaByEvent[c.event_id].push(c);
      });

      (participantsRes.data || []).forEach((p: Participant) => {
        if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
        participantsByEvent[p.event_id].push(p);
      });

      (submissionsRes.data || []).forEach((s: any) => {
        if (!submissionsByEvent[s.event_id]) submissionsByEvent[s.event_id] = [];
        submissionsByEvent[s.event_id].push({ ...s, is_synced: true });
      });
    }

    set({
      events: eventsData as Event[],
      criteriaByEvent,
      participantsByEvent,
      submissionsByEvent,
    });

    get().subscribeToEventRealtime();
  },

  createEvent: async (orgId, name, tieBreakerMethod = 'weighted') => {
    const { data, error } = await supabase
      .from('events')
      .insert({
        org_id: orgId,
        name: name.trim(),
        state: 'draft',
        tie_breaker_method: tieBreakerMethod,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Create Event Error:', error?.message);
      return null;
    }

    const createdEvent = data as Event;
    set((state) => ({
      events: [createdEvent, ...state.events],
      criteriaByEvent: { ...state.criteriaByEvent, [createdEvent.id]: [] },
      participantsByEvent: { ...state.participantsByEvent, [createdEvent.id]: [] },
      submissionsByEvent: { ...state.submissionsByEvent, [createdEvent.id]: [] },
    }));

    return createdEvent;
  },

  updateEventState: async (eventId, nextState) => {
    const currentEvent = get().events.find((e) => e.id === eventId);
    // Hard architectural lock: Once 'ended', reject any mutation locally and remotely
    if (currentEvent?.state === 'ended') {
      console.warn('Cannot mutate an ended event.');
      return false;
    }

    const { data, error } = await supabase
      .from('events')
      .update({ state: nextState })
      .eq('id', eventId)
      .select()
      .single();

    if (error || !data) {
      console.error('Update Event State Error:', error?.message);
      return false;
    }

    const updated = data as Event;
    set((state) => ({
      events: state.events.map((e) => (e.id === eventId ? updated : e)),
      activeEvent: state.activeEvent?.id === eventId ? updated : state.activeEvent,
    }));

    return true;
  },

  saveCriteriaForEvent: async (eventId, criteriaList) => {
    // Replace draft criteria for this event cleanly
    await supabase.from('criteria').delete().eq('event_id', eventId);

    const payload = criteriaList.map((c, idx) => ({
      event_id: eventId,
      name: c.name,
      max_marks: c.max_marks,
      is_tie_breaker: c.is_tie_breaker,
      order_index: idx,
    }));

    const { data, error } = await supabase
      .from('criteria')
      .insert(payload)
      .select()
      .order('order_index', { ascending: true });

    if (error || !data) {
      console.error('Save Criteria Error:', error?.message);
      return false;
    }

    set((state) => ({
      criteriaByEvent: { ...state.criteriaByEvent, [eventId]: data as Criterion[] },
      criteria:
        state.activeEvent?.id === eventId ? (data as Criterion[]) : state.criteria,
    }));

    return true;
  },

  bulkImportParticipants: async (eventId, newParticipants) => {
    const payload = newParticipants.map((p) => ({
      event_id: eventId,
      serial_no: p.serial_no,
      name: p.name,
      class_name: p.class_name || null,
      school_name: p.school_name,
      cluster_name: p.cluster_name || null,
      block_name: p.block_name || null,
    }));

    const { data, error } = await supabase
      .from('participants')
      .upsert(payload, { onConflict: 'event_id,serial_no' })
      .select()
      .order('serial_no', { ascending: true });

    if (error || !data) {
      console.error('Bulk Import Error:', error?.message);
      return false;
    }

    set((state) => ({
      participantsByEvent: {
        ...state.participantsByEvent,
        [eventId]: data as Participant[],
      },
      participants:
        state.activeEvent?.id === eventId
          ? (data as Participant[])
          : state.participants,
    }));

    return true;
  },

  subscribeToEventRealtime: (eventId) => {
    get().unsubscribeFromRealtime();

    const channel = supabase
      .channel('open-jury-live-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          ...(eventId ? { filter: `id=eq.${eventId}` } : {}),
        },
        (payload) => {
          const updatedEvent = payload.new as Event;
          set((state) => ({
            events: state.events.map((e) =>
              e.id === updatedEvent.id ? updatedEvent : e
            ),
            activeEvent:
              state.activeEvent?.id === updatedEvent.id
                ? updatedEvent
                : state.activeEvent,
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'score_submissions',
          ...(eventId ? { filter: `event_id=eq.${eventId}` } : {}),
        },
        (payload) => {
          const newSub = {
            ...(payload.new as ScoreSubmission),
            is_synced: true,
          };
          set((state) => {
            const existing = state.submissionsByEvent[newSub.event_id] || [];
            const alreadyPresent = existing.some((s) => s.id === newSub.id);
            if (alreadyPresent) return state;
            return {
              submissionsByEvent: {
                ...state.submissionsByEvent,
                [newSub.event_id]: [...existing, newSub],
              },
            };
          });
        }
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribeFromRealtime: () => {
    const existing = get().realtimeChannel;
    if (existing) {
      supabase.removeChannel(existing);
      set({ realtimeChannel: null });
    }
  },
}));
