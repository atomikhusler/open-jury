// src/app/(public)/live-[id].tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated from 'react-native-reanimated';
import { Radio, Tv, ShieldCheck, PauseCircle, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../../core/supabase';
import {
  Event,
  Criterion,
  Participant,
  ScoreSubmission,
} from '../../types/database.types';
import { calculateRankings } from '../../utils/ranking-engine';
import { AnimatedLeaderboardRow } from '../../components/features/AnimatedLeaderboardRow';

export default function PublicLiveTvScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;

  const [event, setEvent] = useState<Event | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<ScoreSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchLiveEventBundle = useCallback(async () => {
    if (!eventId) return;
    try {
      const [eventRes, criteriaRes, participantsRes, submissionsRes] =
        await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).single(),
          supabase
            .from('criteria')
            .select('*')
            .eq('event_id', eventId)
            .order('order_index', { ascending: true }),
          supabase
            .from('participants')
            .select('*')
            .eq('event_id', eventId)
            .order('serial_no', { ascending: true }),
          supabase
            .from('score_submissions')
            .select('*')
            .eq('event_id', eventId)
            .order('submitted_at', { ascending: true }),
        ]);

      if (eventRes.data) setEvent(eventRes.data as Event);
      if (criteriaRes.data) setCriteria(criteriaRes.data as Criterion[]);
      if (participantsRes.data) setParticipants(participantsRes.data as Participant[]);
      if (submissionsRes.data) {
        setSubmissions(
          (submissionsRes.data as any[]).map((s) => ({ ...s, is_synced: true }))
        );
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Live TV Fetch Error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventId]);

  // Initial Data Hydration + Realtime WebSocket Subscription
  useEffect(() => {
    fetchLiveEventBundle();

    if (!eventId) return;

    const channel = supabase
      .channel(`public-live-tv-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'score_submissions',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newSub = { ...(payload.new as ScoreSubmission), is_synced: true };
          setSubmissions((prev) => {
            if (prev.some((s) => s.id === newSub.id)) return prev;
            return [...prev, newSub];
          });
          setLastUpdated(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${eventId}`,
        },
        (payload) => {
          setEvent(payload.new as Event);
          setLastUpdated(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const updatedParticipant = payload.new as Participant;
          setParticipants((prev) =>
            prev.map((p) => (p.id === updatedParticipant.id ? updatedParticipant : p))
          );
          setLastUpdated(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, fetchLiveEventBundle]);

  const maxPossiblePerJudge = useMemo(
    () => criteria.reduce((sum, c) => sum + Number(c.max_marks || 0), 0),
    [criteria]
  );

  const rankedList = useMemo(() => {
    if (!event) return [];
    return calculateRankings(participants, submissions, criteria, {
      rankingEnabled: Boolean(event.ranking_enabled),
      fairTrimEnabled: Boolean(event.fair_trim_enabled),
      tieBreakerMethod: event.tie_breaker_method || 'weighted',
    });
  }, [event, participants, submissions, criteria]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-400 font-semibold mt-4">
          Connecting to Open Jury Live Broadcast...
        </Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center px-6">
        <Tv size={48} color="#64748b" />
        <Text className="text-white font-bold text-xl mt-4">
          Live Broadcast Not Found
        </Text>
        <Text className="text-slate-400 text-center mt-2">
          Verify the Event ID or ask the competition organiser for the active public link.
        </Text>
      </View>
    );
  }

  const scoredCompetitorsCount = rankedList.filter((r) => r.judgeCount > 0).length;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      {/* Top Broadcast Header */}
      <View className="px-5 pt-4 pb-4 border-b border-slate-800/80 bg-slate-900/70">
        <View className="flex-row items-center justify-between flex-wrap gap-2">
          <View className="flex-row items-center">
            <View className="flex-row items-center bg-red-500/15 border border-red-500/40 px-2.5 py-1 rounded-full mr-3">
              <Radio size={14} color="#ef4444" />
              <Text className="text-red-400 font-extrabold text-xs ml-1.5 tracking-wider">
                LIVE LEDGER
              </Text>
            </View>
            <Text className="text-slate-400 text-xs font-semibold">
              ORG: {event.org_id}
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            {event.state === 'paused' && (
              <View className="flex-row items-center bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full">
                <PauseCircle size={14} color="#f59e0b" />
                <Text className="text-amber-300 text-xs font-bold ml-1.5">
                  EVENT PAUSED
                </Text>
              </View>
            )}
            {event.state === 'ended' && (
              <View className="flex-row items-center bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full">
                <CheckCircle2 size={14} color="#10b981" />
                <Text className="text-emerald-300 text-xs font-bold ml-1.5">
                  FINAL OFFICIAL RESULTS
                </Text>
              </View>
            )}
            <View className="flex-row items-center bg-slate-800 px-3 py-1 rounded-full">
              <ShieldCheck size={13} color="#38bdf8" />
              <Text className="text-slate-300 text-xs font-medium ml-1.5">
                Zero-Trust Verified
              </Text>
            </View>
          </View>
        </View>

        {/* Event Title & Live Counters */}
        <View className="mt-3 flex-row items-end justify-between flex-wrap">
          <View>
            <Text className="text-white font-black text-2xl md:text-3xl">
              {event.name}
            </Text>
            <Text className="text-slate-400 text-xs mt-1">
              {event.ranking_enabled
                ? `Auto-Ranking Active (${event.tie_breaker_method.replace('_', ' ').toUpperCase()})`
                : 'Score Ledger Mode (Ordered by Serial No.)'}
              {event.fair_trim_enabled ? ' • Olympic Fair Trim ON' : ''}
            </Text>
          </View>

          <View className="flex-row items-center mt-2 md:mt-0">
            <View className="bg-slate-800/90 px-3 py-1.5 rounded-xl mr-2">
              <Text className="text-slate-400 text-[10px] uppercase font-bold">
                Scored
              </Text>
              <Text className="text-white font-extrabold text-sm">
                {scoredCompetitorsCount} / {participants.length}
              </Text>
            </View>

            <View className="bg-slate-800/90 px-3 py-1.5 rounded-xl">
              <Text className="text-slate-400 text-[10px] uppercase font-bold">
                Last Sync
              </Text>
              <Text className="text-sky-400 font-bold text-sm">
                {lastUpdated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Animated Leaderboard Stream */}
      <Animated.ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              fetchLiveEventBundle();
            }}
            tintColor="#3b82f6"
          />
        }
      >
        {rankedList.length === 0 ? (
          <View className="py-16 items-center">
            <Text className="text-slate-500 font-semibold text-base">
              No participants registered for this event yet.
            </Text>
          </View>
        ) : (
          rankedList.map((item) => (
            <AnimatedLeaderboardRow
              key={item.participant.id}
              item={item}
              maxPossiblePerJudge={maxPossiblePerJudge}
              rankingEnabled={Boolean(event.ranking_enabled)}
              isOrganiserView={false}
            />
          ))
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}