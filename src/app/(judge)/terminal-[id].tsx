// src/app/(judge)/terminal-[id].tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Search,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  StopCircle,
} from 'lucide-react-native';
import { useEventStore } from '../../store/useEventStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ParticipantCard } from '../../components/features/ParticipantCard';
import { SmartSearch } from '../../components/features/SmartSearch';
import { NumericSlider } from '../../components/primitives/NumericSlider';
import { Button } from '../../components/primitives/Button';
import { ScoreSubmission } from '../../types/database.types';

const OFFLINE_QUEUE_STORAGE_KEY = 'open_jury_offline_submissions';

export default function JudgeTerminalScreen() {
  const { id: eventIdParam } = useLocalSearchParams<{ id: string }>();

  const { user } = useAuthStore();
  const { isOnline, addPendingSubmission } = useSyncStore();
  const {
    activeEvent,
    activeParticipant,
    participants,
    criteria,
    submittedParticipantIds,
    setActiveEvent,
    setActiveParticipant,
    setParticipants,
    setCriteria,
    markParticipantSubmitted,
  } = useEventStore();

  // Local state holding slider marks for the current participant: { [criterion_id]: number }
  const [scores, setScores] = useState<Record<string, number>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seed Mock Data for Phase 3 Testing if store is empty
  useEffect(() => {
    if (!activeEvent) {
      const mockEventId = eventIdParam || 'evt-dance-2026';
      setActiveEvent({
        id: mockEventId,
        org_id: 'OD2026',
        name: 'Cluster Level Classical Dance',
        state: 'active',
        tie_breaker_method: 'weighted',
        created_at: new Date().toISOString(),
      });

      setCriteria([
        { id: 'c1', event_id: mockEventId, name: 'Costume & Appearance', max_marks: 5, is_tie_breaker: false, order_index: 1 },
        { id: 'c2', event_id: mockEventId, name: 'Props & Stage Use', max_marks: 5, is_tie_breaker: false, order_index: 2 },
        { id: 'c3', event_id: mockEventId, name: 'Expression & Emotion (Abhinaya)', max_marks: 10, is_tie_breaker: false, order_index: 3 },
        { id: 'c4', event_id: mockEventId, name: 'Choreography & Rhythm (Taal)', max_marks: 10, is_tie_breaker: true, order_index: 4 },
      ]);

      const mockParticipants = [
        { id: 'p1', event_id: mockEventId, serial_no: 1, name: 'Aarav Mohanty', class_name: '9', school_name: 'Govt. High School, Unit-9', cluster_name: 'Central Cluster', block_name: 'Bhubaneswar' },
        { id: 'p2', event_id: mockEventId, serial_no: 2, name: 'Subhashree Das', class_name: '10', school_name: 'Capital Girls High School', cluster_name: 'South Cluster', block_name: 'Bhubaneswar' },
        { id: 'p3', event_id: mockEventId, serial_no: 3, name: 'Rohan Patnaik', class_name: '8', school_name: 'ODM Public School', cluster_name: 'North Cluster', block_name: 'Bhubaneswar' },
        { id: 'p4', event_id: mockEventId, serial_no: 4, name: 'Ananya Mishra', class_name: '10', school_name: 'Saraswati Sishu Vidya Mandir', cluster_name: 'East Cluster', block_name: 'Bhubaneswar' },
      ];
      setParticipants(mockParticipants);
      setActiveParticipant(mockParticipants[0]);
    }
  }, [activeEvent, eventIdParam, setActiveEvent, setCriteria, setParticipants, setActiveParticipant]);

  // Reset local slider scores whenever the judge switches to a different participant
  useEffect(() => {
    setScores({});
  }, [activeParticipant?.id]);

  // Calculate Max Possible Total & Live Current Total
  const maxTotalMarks = useMemo(
    () => criteria.reduce((sum, c) => sum + c.max_marks, 0),
    [criteria]
  );

  const currentTotalMarks = useMemo(
    () => Object.values(scores).reduce((sum, val) => sum + val, 0),
    [scores]
  );

  // Iron-Clad Submit Guard: Every criterion must have an explicit numeric value
  const allCriteriaScored = useMemo(
    () =>
      criteria.length > 0 &&
      criteria.every((c) => typeof scores[c.id] === 'number'),
    [criteria, scores]
  );

  const isAlreadySubmitted = useMemo(
    () =>
      activeParticipant
        ? submittedParticipantIds.includes(activeParticipant.id)
        : false,
    [activeParticipant, submittedParticipantIds]
  );

  // Manual Prev / Next Participant Navigation
  const currentIndex = useMemo(
    () => participants.findIndex((p) => p.id === activeParticipant?.id),
    [participants, activeParticipant]
  );

  const handlePrevParticipant = () => {
    if (currentIndex > 0) {
      setActiveParticipant(participants[currentIndex - 1]);
    }
  };

  const handleNextParticipant = () => {
    if (currentIndex >= 0 && currentIndex < participants.length - 1) {
      setActiveParticipant(participants[currentIndex + 1]);
    }
  };

  const handleScoreChange = (criterionId: string, value: number) => {
    if (isAlreadySubmitted) return;
    setScores((prev) => ({
      ...prev,
      [criterionId]: value,
    }));
  };

  // Final Immutable Submission Execution
  const handleConfirmSubmission = async () => {
    if (!activeEvent || !activeParticipant || !allCriteriaScored || isAlreadySubmitted) {
      return;
    }

    setIsSubmitting(true);
    try {
      const submission: ScoreSubmission = {
        id: `sub_${Date.now()}_${activeParticipant.id}`,
        event_id: activeEvent.id,
        judge_id: user?.id || 'judge_local',
        participant_id: activeParticipant.id,
        scores,
        total_score: currentTotalMarks,
        submitted_at: new Date().toISOString(),
        is_synced: isOnline,
      };

      // Save to local AsyncStorage ledger (if offline, queues for sync)
      const existingRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      const existingList: ScoreSubmission[] = existingRaw ? JSON.parse(existingRaw) : [];
      existingList.push(submission);
      await AsyncStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(existingList));

      if (!isOnline) {
        addPendingSubmission();
      }

      // Lock participant in store (NO AUTO-ADVANCE to prevent errors)
      markParticipantSubmitted(activeParticipant.id);
      setIsConfirmModalOpen(false);
    } catch (error) {
      console.error('Error saving score submission:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Event State Overlay (Paused or Ended)
  if (activeEvent && activeEvent.state !== 'active') {
    const isPaused = activeEvent.state === 'paused';
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center p-6">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-8 items-center max-w-md w-full">
          {isPaused ? (
            <PauseCircle size={64} color="#f59e0b" />
          ) : (
            <StopCircle size={64} color="#ef4444" />
          )}
          <Text className="text-2xl font-black text-white mt-4 text-center">
            {isPaused ? 'Competition Paused' : 'Competition Ended'}
          </Text>
          <Text className="text-slate-400 text-sm text-center mt-2 leading-relaxed">
            {isPaused
              ? 'The organiser has temporarily paused scoring for this event. Your terminal will unlock automatically when resumed.'
              : 'This event has officially concluded. All submitted scores are permanently locked in the ledger.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-950">
      {/* Top Event Navigation & Smart Search Trigger Bar */}
      <View className="bg-slate-900/70 border-b border-slate-800/80 px-4 py-2.5 flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-blue-400" numberOfLines={1}>
            {activeEvent?.name || 'Loading Event...'}
          </Text>
          <Text className="text-[11px] text-slate-400">
            Progress: {submittedParticipantIds.length} of {participants.length} Scored
          </Text>
        </View>

        {/* Manual Prev/Next & Smart Search Bar */}
        <View className="flex-row items-center space-x-2">
          <Pressable
            onPress={handlePrevParticipant}
            disabled={currentIndex <= 0}
            className={`p-2 rounded-xl border ${
              currentIndex <= 0
                ? 'bg-slate-900 border-slate-800 opacity-40'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <ChevronLeft size={18} color="#f8fafc" />
          </Pressable>

          <Pressable
            onPress={() => setIsSearchOpen(true)}
            className="flex-row items-center bg-blue-600 px-3.5 py-2 rounded-xl shadow"
          >
            <Search size={15} color="#ffffff" />
            <Text className="text-white font-bold text-xs ml-1.5">
              Find Sl. No.
            </Text>
          </Pressable>

          <Pressable
            onPress={handleNextParticipant}
            disabled={currentIndex >= participants.length - 1}
            className={`p-2 rounded-xl border ${
              currentIndex >= participants.length - 1
                ? 'bg-slate-900 border-slate-800 opacity-40'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <ChevronRight size={18} color="#f8fafc" />
          </Pressable>
        </View>
      </View>

      {/* Main Scrollable Scoring Area */}
      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {activeParticipant && (
          <ParticipantCard
            participant={activeParticipant}
            isSubmitted={isAlreadySubmitted}
          />
        )}

        {/* Locked Banner if Already Scored */}
        {isAlreadySubmitted ? (
          <View className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-6 items-center my-4">
            <CheckCircle2 size={44} color="#10b981" />
            <Text className="text-xl font-black text-white mt-3">
              Score Permanently Locked
            </Text>
            <Text className="text-sm text-slate-300 text-center mt-1">
              You have already submitted marks for Sl. No. #{activeParticipant?.serial_no} ({activeParticipant?.name}).
            </Text>
            <View className="flex-row space-x-3 mt-5">
              <Pressable
                onPress={() => setIsSearchOpen(true)}
                className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-xl flex-row items-center mr-3"
              >
                <Search size={15} color="#cbd5e1" />
                <Text className="text-white font-bold text-xs ml-2">
                  Search Participant
                </Text>
              </Pressable>

              {currentIndex < participants.length - 1 && (
                <Pressable
                  onPress={handleNextParticipant}
                  className="bg-blue-600 px-4 py-2.5 rounded-xl flex-row items-center"
                >
                  <Text className="text-white font-bold text-xs mr-1.5">
                    Next Sl. No. (#{participants[currentIndex + 1]?.serial_no})
                  </Text>
                  <ChevronRight size={15} color="#ffffff" />
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          /* Dynamic Rubric Sliders */
          <View className="space-y-4">
            {criteria.map((criterion, idx) => (
              <View key={criterion.id} className="mb-3">
                <NumericSlider
                  label={`${idx + 1}. ${criterion.name}`}
                  maxMarks={criterion.max_marks}
                  value={scores[criterion.id] ?? null}
                  onChange={(val: number) => handleScoreChange(criterion.id, val)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Total Calculation & Submit Bar */}
      {!isAlreadySubmitted && (
        <View className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-4 py-3.5 flex-row items-center justify-between shadow-2xl">
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              LIVE TOTAL SCORE
            </Text>
            <View className="flex-row items-baseline mt-0.5">
              <Text className="text-3xl font-black text-white">
                {currentTotalMarks}
              </Text>
              <Text className="text-base font-bold text-slate-400 ml-1">
                / {maxTotalMarks}
              </Text>
            </View>
          </View>

          <View className="w-56">
            <Button
              title={
                !isOnline
                  ? 'Reconnect to Submit'
                  : allCriteriaScored
                  ? 'Lock & Submit Score'
                  : `Score All (${Object.keys(scores).length}/${criteria.length})`
              }
              variant={allCriteriaScored && isOnline ? 'primary' : 'secondary'}
              disabled={!allCriteriaScored || !isOnline}
              onPress={() => setIsConfirmModalOpen(true)}
            />
          </View>
        </View>
      )}

      {/* High-Friction Irreversible Confirmation Modal */}
      <Modal
        visible={isConfirmModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsConfirmModalOpen(false)}
      >
        <View className="flex-1 bg-black/80 items-center justify-center p-5">
          <View className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md">
            <View className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 items-center justify-center mb-4 self-center">
              <AlertTriangle size={26} color="#f59e0b" />
            </View>

            <Text className="text-xl font-black text-white text-center">
              Confirm Immutable Score
            </Text>

            <Text className="text-xs text-slate-300 text-center mt-2 leading-relaxed">
              Attention: Once submitted, your scores for{' '}
              <Text className="font-bold text-white">
                Sl. No. #{activeParticipant?.serial_no} ({activeParticipant?.name})
              </Text>{' '}
              cannot be changed, recalled, or edited by you or the organiser.
            </Text>

            {/* Criterion Breakdown Summary */}
            <View className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 my-4 space-y-2">
              {criteria.map((c) => (
                <View
                  key={c.id}
                  className="flex-row items-center justify-between py-1 border-b border-slate-800/60"
                >
                  <Text className="text-xs text-slate-300 flex-1 pr-2" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text className="text-xs font-extrabold text-white">
                    {scores[c.id]} / {c.max_marks}
                  </Text>
                </View>
              ))}
              <View className="flex-row items-center justify-between pt-2">
                <Text className="text-sm font-black text-blue-400">
                  FINAL TOTAL
                </Text>
                <Text className="text-lg font-black text-white">
                  {currentTotalMarks} / {maxTotalMarks}
                </Text>
              </View>
            </View>

            {/* Modal Actions */}
            <View className="flex-row space-x-3 mt-2">
              <Pressable
                onPress={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 border border-slate-700 items-center mr-2"
              >
                <Text className="text-slate-300 font-bold text-sm">
                  Review Again
                </Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmSubmission}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-xl bg-blue-600 items-center flex-row justify-center"
              >
                <Lock size={15} color="#ffffff" />
                <Text className="text-white font-black text-sm ml-1.5">
                  {isSubmitting ? 'Locking...' : 'Confirm & Lock'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Smart Search Modal */}
      <SmartSearch
        visible={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </View>
  );
}