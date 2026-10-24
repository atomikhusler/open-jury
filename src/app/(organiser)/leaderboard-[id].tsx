// src/app/(organiser)/leaderboard-[id].tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  Switch,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Tv,
  Copy,
  Check,
  Award,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react-native';
import { supabase } from '../../core/supabase';
import {
  Event,
  Criterion,
  Participant,
  ScoreSubmission,
  TieBreakerMethod,
} from '../../types/database.types';
import { calculateRankings, RankedParticipant } from '../../utils/ranking-engine';
import { AnimatedLeaderboardRow } from '../../components/features/AnimatedLeaderboardRow';
import { useEventStore } from '../../store/useEventStore';

const TIE_BREAKER_OPTIONS: {
  key: TieBreakerMethod;
  label: string;
  desc: string;
}[] = [
  {
    key: 'weighted',
    label: 'Weighted Criterion',
    desc: 'Higher score in designated Tie-Breaker criterion wins.',
  },
  {
    key: 'olympic_trim',
    label: 'Olympic Trim',
    desc: 'Drops highest & lowest judge scores (requires 3+ judges).',
  },
  {
    key: 'timestamp',
    label: 'Timestamp Advantage',
    desc: 'Competitor scored earlier in competition time wins.',
  },
  {
    key: 'shared',
    label: 'Shared Placement',
    desc: 'Awards identical rank (e.g., 2nd & 2nd, next is 4th).',
  },
  {
    key: 'manual',
    label: 'Chief Judge Override',
    desc: 'Highlights ties in red for manual +0.1 Chief Judge decision.',
  },
];

export default function OrganiserLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<ScoreSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Manual Tie-Breaker Modal State
  const [selectedTieTarget, setSelectedTieTarget] =
    useState<RankedParticipant | null>(null);
  const [isApplyingOverride, setIsApplyingOverride] = useState<boolean>(false);

  const loadLeaderboardData = useCallback(async () => {
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
    } catch (error) {
      console.error('Organiser Leaderboard Fetch Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadLeaderboardData();

    if (!eventId) return;
    const channel = supabase
      .channel(`organiser-leaderboard-${eventId}`)
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
          const updated = payload.new as Participant;
          setParticipants((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, loadLeaderboardData]);

  // Persist Ranking Settings (Ranking Toggle, Fair Trim Toggle, or Tie-Breaker Method)
  const updateRankingConfig = async (
    patch: Partial<
      Pick<Event, 'ranking_enabled' | 'fair_trim_enabled' | 'tie_breaker_method'>
    >
  ) => {
    if (!event) return;
    const optimistic = { ...event, ...patch };
    setEvent(optimistic);

    const { data, error } = await supabase
      .from('events')
      .update(patch)
      .eq('id', event.id)
      .select()
      .single();

    if (!error && data) {
      setEvent(data as Event);
      useEventStore.getState(). fetchOrganiserWorkspace(event.org_id);
    }
  };

  // Execute Chief Judge +0.10 Override RPC
  const handleConfirmManualOverride = async (bonusAmount: number) => {
    if (!selectedTieTarget) return;
    setIsApplyingOverride(true);
    try {
      const { data, error } = await supabase.rpc('apply_manual_tiebreaker', {
        p_participant_id: selectedTieTarget.participant.id,
        p_bonus: bonusAmount,
      });

      if (error) throw new Error(error.message);

      if (data) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === selectedTieTarget.participant.id
              ? { ...p, manual_tie_break_bonus: bonusAmount }
              : p
          )
        );
      }
      setSelectedTieTarget(null);
    } catch (err: any) {
      console.error('Manual Tie-Break Error:', err?.message);
    } finally {
      setIsApplyingOverride(false);
    }
  };

  const handleCopyPublicTvLink = async () => {
    if (!event) return;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://openjury.app';
    const liveUrl = `${origin}/live-${event.id}`;
    await Clipboard.setStringAsync(liveUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

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

  const unresolvedManualTiesCount = useMemo(
    () => rankedList.filter((r) => r.needsManualOverride).length,
    [rankedList]
  );

  if (isLoading || !event) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Top Navigation & Public TV Link Actions */}
        <View className="flex-row items-center justify-between flex-wrap gap-2 mb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl"
          >
            <ArrowLeft size={16} color="#e2e8f0" />
            <Text className="text-slate-200 font-semibold text-sm ml-2">
              Back to Event
            </Text>
          </Pressable>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={handleCopyPublicTvLink}
              className="flex-row items-center bg-slate-900 border border-slate-700 px-3.5 py-2 rounded-xl mr-2"
            >
              {copiedLink ? (
                <Check size={15} color="#10b981" />
              ) : (
                <Copy size={15} color="#38bdf8" />
              )}
              <Text className="text-slate-200 font-semibold text-xs ml-2">
                {copiedLink ? 'TV Link Copied!' : 'Copy Public TV Link'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push(`/(public)/live-${event.id}` as any)}
              className="flex-row items-center bg-blue-600 px-3.5 py-2 rounded-xl"
            >
              <Tv size={15} color="#ffffff" />
              <Text className="text-white font-bold text-xs ml-2">
                Launch Live TV View
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Organiser Ranking & Tie-Breaker Control Panel */}
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
          <View className="flex-row items-center mb-3">
            <SlidersHorizontal size={18} color="#3b82f6" />
            <Text className="text-white font-bold text-base ml-2">
              Leaderboard & Tie-Breaker Engine ({event.name})
            </Text>
          </View>

          {/* Toggle 1: Enable Automatic Ranking */}
          <View className="flex-row items-center justify-between py-2.5 border-b border-slate-800">
            <View className="flex-1 pr-4">
              <Text className="text-slate-200 font-semibold text-sm">
                Enable Automatic Placement Ranking (1st, 2nd, 3rd)
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                When OFF, acts as a neutral score ledger ordered by Serial No.
              </Text>
            </View>
            <Switch
              value={Boolean(event.ranking_enabled)}
              onValueChange={(val) => updateRankingConfig({ ranking_enabled: val })}
              trackColor={{ false: '#334155', true: '#2563eb' }}
            />
          </View>

          {/* Toggle 2: Global Olympic Fair Trim */}
          <View className="flex-row items-center justify-between py-2.5 border-b border-slate-800">
            <View className="flex-1 pr-4">
              <Text className="text-slate-200 font-semibold text-sm">
                Olympic Fair Trim Mode (Drop Highest & Lowest Judge)
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                Automatically activates when 3 or more judges score a competitor.
              </Text>
            </View>
            <Switch
              value={Boolean(event.fair_trim_enabled)}
              onValueChange={(val) => updateRankingConfig({ fair_trim_enabled: val })}
              trackColor={{ false: '#334155', true: '#2563eb' }}
            />
          </View>

          {/* 5 Tie-Breaker Method Selector Pills */}
          {event.ranking_enabled && (
            <View className="mt-3">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                Active Tie-Breaker Protocol
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {TIE_BREAKER_OPTIONS.map((opt) => {
                  const isSelected = event.tie_breaker_method === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() =>
                        updateRankingConfig({ tie_breaker_method: opt.key })
                      }
                      className={`px-3 py-2 rounded-xl border ${
                        isSelected
                          ? 'bg-blue-600/25 border-blue-500'
                          : 'bg-slate-800/80 border-slate-700'
                      }`}
                    >
                      <Text
                        className={`font-bold text-xs ${
                          isSelected ? 'text-blue-300' : 'text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </Text>
                      <Text className="text-slate-400 text-[10px] mt-0.5">
                        {opt.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Warning Banner if Manual Override Ties Detected */}
        {unresolvedManualTiesCount > 0 && (
          <View className="bg-red-950/50 border border-red-500/60 rounded-2xl p-3.5 mb-4 flex-row items-center">
            <AlertTriangle size={20} color="#ef4444" />
            <View className="ml-3 flex-1">
              <Text className="text-red-300 font-bold text-sm">
                {unresolvedManualTiesCount} Tied Competitors Require Chief Judge
                Override
              </Text>
              <Text className="text-red-200/80 text-xs mt-0.5">
                Tap "Break Tie (+0.1)" on the winning competitor below to resolve the
                placement lock.
              </Text>
            </View>
          </View>
        )}

        {/* Live Leaderboard Rows */}
        {rankedList.map((item) => (
          <AnimatedLeaderboardRow
            key={item.participant.id}
            item={item}
            maxPossiblePerJudge={maxPossiblePerJudge}
            rankingEnabled={Boolean(event.ranking_enabled)}
            isOrganiserView={true}
            onPressManualOverride={(target) => setSelectedTieTarget(target)}
          />
        ))}
      </ScrollView>

      {/* Chief Judge Manual Tie-Breaker Confirmation Modal */}
      <Modal
        visible={Boolean(selectedTieTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTieTarget(null)}
      >
        <View className="flex-1 bg-black/75 items-center justify-center px-5">
          <View className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <View className="flex-row items-center mb-3">
              <Award size={24} color="#f59e0b" />
              <Text className="text-white font-black text-lg ml-2">
                Chief Judge Tie-Breaker Override
              </Text>
            </View>

            {selectedTieTarget && (
              <>
                <Text className="text-slate-300 text-sm leading-relaxed">
                  You are modifying the tie-breaker resolution for{' '}
                  <Text className="text-white font-bold">
                    SL #{selectedTieTarget.participant.serial_no} -{' '}
                    {selectedTieTarget.participant.name}
                  </Text>{' '}
                  ({selectedTieTarget.participant.school_name}).
                </Text>

                <View className="bg-slate-800 rounded-xl p-3 my-4">
                  <Text className="text-slate-400 text-xs">
                    Judge Raw Score remain 100% untouched. This records an explicit,
                    publicly auditable{' '}
                    <Text className="text-amber-400 font-bold">
                      +0.1 Chief Judge Override
                    </Text>{' '}
                    to resolve the placement tie.
                  </Text>
                </View>

                <View className="flex-row justify-end gap-3 mt-2">
                  <Pressable
                    disabled={isApplyingOverride}
                    onPress={() => setSelectedTieTarget(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 mr-2"
                  >
                    <Text className="text-slate-300 font-bold text-sm">Cancel</Text>
                  </Pressable>

                  {selectedTieTarget.manualBonus > 0 && (
                    <Pressable
                      disabled={isApplyingOverride}
                      onPress={() => handleConfirmManualOverride(0)}
                      className="px-4 py-2.5 rounded-xl bg-slate-700 mr-2"
                    >
                      <Text className="text-white font-bold text-sm">
                        Remove +0.1
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    disabled={isApplyingOverride}
                    onPress={() => handleConfirmManualOverride(0.1)}
                    className="px-5 py-2.5 rounded-xl bg-amber-500"
                  >
                    <Text className="text-slate-950 font-black text-sm">
                      {isApplyingOverride ? 'Applying...' : 'Award +0.1 & Break Tie'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}