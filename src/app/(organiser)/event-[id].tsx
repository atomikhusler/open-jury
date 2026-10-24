// src/app/(organiser)/event-[id].tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Play, Pause, Square, FileSpreadsheet,  Plus, Trash2, AlertTriangle, Star, Users, Eye, Trophy } from 'lucide-react-native';
import { useEventStore } from '../../store/useEventStore';
import { JudgeAccessManager } from '../../components/features/JudgeAccessManager';

export default function EventControlScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const {
    events,
    criteriaByEvent,
    participantsByEvent,
    updateEventState,
    addCriterion,
    removeCriterion,
    loadEventForContext,
  } = useEventStore();

  const event = events.find((e) => e.id === id);
  const criteria = (id && criteriaByEvent[id]) || [];
  const participants = (id && participantsByEvent[id]) || [];

  const [critName, setCritName] = useState('');
  const [critMax, setCritMax] = useState('10');
  const [isTieBreaker, setIsTieBreaker] = useState(false);
  const [confirmEndModal, setConfirmEndModal] = useState(false);

  if (!event || !id) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center p-6">
        <Text className="text-slate-400 text-base">Event not found.</Text>
      </View>
    );
  }

  const totalMaxMarks = criteria.reduce((acc, c) => acc + c.max_marks, 0);
  const isLocked = event.state !== 'draft';

  const handleAddCriterion = () => {
    const marks = parseInt(critMax, 10);
    if (!critName.trim() || isNaN(marks) || marks <= 0) return;
    addCriterion(id, critName, marks, isTieBreaker);
    setCritName('');
    setCritMax('10');
    setIsTieBreaker(false);
  };

  return (
    <ScrollView className="flex-1 bg-slate-950 p-5">
      {/* Top Event Control Bar (State Machine) */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-5">
        <View className="flex-row flex-wrap items-center justify-between gap-4">
          <View>
            <Text className="text-slate-400 text-xs font-mono uppercase">
              Event Command Center • {event.org_id}
            </Text>
            <Text className="text-white text-2xl font-extrabold mt-0.5">{event.name}</Text>
          </View>

          {/* State Machine Controls */}
          <View className="flex-row items-center gap-3">
            {event.state === 'draft' && (
              <Pressable
                onPress={() => updateEventState(id, 'active')}
                disabled={criteria.length === 0 || participants.length === 0}
                className={`px-5 py-3 rounded-xl flex-row items-center ${
                  criteria.length === 0 || participants.length === 0
                    ? 'bg-slate-800 opacity-50'
                    : 'bg-emerald-600 active:bg-emerald-700'
                }`}
              >
                <Play size={16} color="#ffffff" />
                <Text className="text-white font-bold text-sm ml-2">Start Live Event</Text>
              </Pressable>
            )}

            {event.state === 'active' && (
              <>
                <Pressable
                  onPress={() => updateEventState(id, 'paused')}
                  className="bg-amber-600 active:bg-amber-700 px-4 py-3 rounded-xl flex-row items-center"
                >
                  <Pause size={16} color="#ffffff" />
                  <Text className="text-white font-bold text-sm ml-2">Pause Event</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmEndModal(true)}
                  className="bg-red-600 active:bg-red-700 px-4 py-3 rounded-xl flex-row items-center"
                >
                  <Square size={16} color="#ffffff" />
                  <Text className="text-white font-bold text-sm ml-2">End Event</Text>
                </Pressable>
              </>
            )}

            {event.state === 'paused' && (
              <>
                <Pressable
                  onPress={() => updateEventState(id, 'active')}
                  className="bg-emerald-600 active:bg-emerald-700 px-4 py-3 rounded-xl flex-row items-center"
                >
                  <Play size={16} color="#ffffff" />
                  <Text className="text-white font-bold text-sm ml-2">Resume Event</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmEndModal(true)}
                  className="bg-red-600 active:bg-red-700 px-4 py-3 rounded-xl flex-row items-center"
                >
                  <Square size={16} color="#ffffff" />
                  <Text className="text-white font-bold text-sm ml-2">End Permanently</Text>
                </Pressable>
              </>
            )}

            {event.state === 'ended' && (
              <View className="bg-red-950/60 border border-red-500/40 px-4 py-2.5 rounded-xl">
                <Text className="text-red-400 font-bold text-xs uppercase">
                  🔒 Event Concluded • Restart Prohibited
                </Text>
              </View>
            )}
          </View>
        </View>

        {(criteria.length === 0 || participants.length === 0) && event.state === 'draft' && (
          <Text className="text-amber-400 text-xs mt-3">
            ⚠️ Add at least 1 criterion and import participants before starting the event.
          </Text>
        )}
      </View>

        <Pressable
        onPress={() => router.push(`/(organiser)/leaderboard-${id}` as any)}
        className="bg-blue-600 active:bg-blue-700 border border-blue-500 rounded-2xl p-4 mb-5 flex-row items-center justify-between shadow-lg"
      >
        <View className="flex-row items-center">
          <View className="bg-white/20 p-2 rounded-xl mr-3">
            <Trophy size={20} color="#ffffff" />
          </View>
          <View>
            <Text className="text-white font-extrabold text-base">Live Leaderboard & Rankings</Text>
            <Text className="text-blue-200 text-xs mt-0.5 font-medium">Manage Tie-Breakers, TV View & Chief Judge Overrides</Text>
          </View>
        </View>
        <Play size={16} color="#bfdbfe" />
      </Pressable>
      
      {/* Section 1: Dynamic Rubric Builder */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-5">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-white font-bold text-lg">Scoring Rubric Criteria</Text>
            <Text className="text-slate-400 text-xs">
              {isLocked
                ? 'Rubric is locked once the event leaves Draft state.'
                : 'Define criteria and integer maximum marks.'}
            </Text>
          </View>
          <View className="bg-blue-600/20 border border-blue-500/40 px-3 py-1.5 rounded-xl">
            <Text className="text-blue-400 font-extrabold text-sm">
              Total Max: {totalMaxMarks} Pts
            </Text>
          </View>
        </View>

        {/* Criteria List */}
        <View className="gap-2.5 mb-4">
          {criteria.map((c, idx) => (
            <View
              key={c.id}
              className="bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl flex-row items-center justify-between"
            >
              <View className="flex-row items-center flex-1">
                <Text className="text-slate-500 font-mono text-xs w-6">#{idx + 1}</Text>
                <Text className="text-white font-semibold text-sm">{c.name}</Text>
                {c.is_tie_breaker && (
                  <View className="bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded ml-2 flex-row items-center">
                    <Star size={10} color="#fbbf24" />
                    <Text className="text-amber-300 text-[10px] font-bold ml-1">Tie-Breaker</Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center gap-3">
                <Text className="text-emerald-400 font-mono font-bold text-sm">
                  0 – {c.max_marks} Marks
                </Text>
                {!isLocked && (
                  <Pressable onPress={() => removeCriterion(id, c.id)} className="p-1">
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Add Criterion Form (Draft Only) */}
        {!isLocked && (
          <View className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex-row flex-wrap items-center gap-2.5">
            <TextInput
              value={critName}
              onChangeText={setCritName}
              placeholder="Criterion Name (e.g. Choreography)"
              placeholderTextColor="#64748b"
              className="bg-slate-900 border border-slate-700 text-white px-3 py-2.5 rounded-lg flex-1 min-w-[160px] text-sm"
            />
            <TextInput
              value={critMax}
              onChangeText={(t) => setCritMax(t.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              placeholder="Max"
              placeholderTextColor="#64748b"
              className="bg-slate-900 border border-slate-700 text-white px-3 py-2.5 rounded-lg w-20 text-center font-mono text-sm"
            />
            <Pressable
              onPress={() => setIsTieBreaker(!isTieBreaker)}
              className={`px-3 py-2.5 rounded-lg border ${
                isTieBreaker
                  ? 'bg-amber-500/20 border-amber-500'
                  : 'bg-slate-900 border-slate-700'
              }`}
            >
              <Text className={isTieBreaker ? 'text-amber-300 text-xs font-bold' : 'text-slate-400 text-xs'}>
                ★ Tie-Break
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAddCriterion}
              className="bg-blue-600 active:bg-blue-700 px-4 py-2.5 rounded-lg flex-row items-center"
            >
              <Plus size={16} color="#ffffff" />
              <Text className="text-white font-bold text-xs ml-1">Add</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Section 2: Competitors & Excel Bulk Upload */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-2">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Users size={18} color="#3b82f6" />
            <Text className="text-white font-bold text-lg ml-2">
              Registered Competitors ({participants.length})
            </Text>
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => router.push(`/(organiser)/bulk-import-${id}`)}
              className="bg-emerald-600 active:bg-emerald-700 px-3.5 py-2.5 rounded-xl flex-row items-center"
            >
              <FileSpreadsheet size={15} color="#ffffff" />
              <Text className="text-white font-bold text-xs ml-1.5">Bulk Import (.xlsx)</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                loadEventForContext(id);
                router.push(`/(judge)/terminal-${id}`);
              }}
              className="bg-slate-800 active:bg-slate-700 px-3 py-2.5 rounded-xl flex-row items-center"
            >
              <Eye size={15} color="#94a3b8" />
              <Text className="text-slate-300 font-semibold text-xs ml-1.5">Preview Terminal</Text>
            </Pressable>
          </View>
        </View>

        {participants.length === 0 ? (
          <View className="bg-slate-950 border border-dashed border-slate-800 rounded-xl p-6 items-center">
            <Text className="text-slate-400 text-xs">
              No participants imported yet. Tap "Bulk Import (.xlsx)" to load your competition sheet.
            </Text>
          </View>
        ) : (
          <View className="gap-2 max-h-60">
            {participants.slice(0, 8).map((p) => (
              <View
                key={p.id}
                className="bg-slate-950 border border-slate-800/80 px-3.5 py-2.5 rounded-lg flex-row items-center justify-between"
              >
                <View className="flex-row items-center">
                  <View className="bg-blue-600/20 px-2.5 py-1 rounded mr-3">
                    <Text className="text-blue-400 font-mono font-bold text-xs">
                      Sl. #{p.serial_no}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-white font-semibold text-sm">{p.name}</Text>
                    <Text className="text-slate-400 text-xs">{p.school_name}</Text>
                  </View>
                </View>
                {p.block_name && (
                  <Text className="text-slate-500 text-xs font-mono">{p.block_name}</Text>
                )}
              </View>
            ))}
            {participants.length > 8 && (
              <Text className="text-slate-500 text-xs text-center mt-1">
                + {participants.length - 8} more participants loaded
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Section 3: Judge Provisioning & QR Code Generator */}
      <JudgeAccessManager orgId={event.org_id} eventId={id} eventName={event.name} />

      <View className="h-12" />

      {/* High-Friction Irreversible End Event Modal */}
      <Modal visible={confirmEndModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center p-5">
          <View className="bg-slate-900 border-2 border-red-500/60 rounded-2xl p-6 w-full max-w-md">
            <View className="w-12 h-12 rounded-full bg-red-500/20 items-center justify-center mb-4">
              <AlertTriangle size={26} color="#ef4444" />
            </View>
            <Text className="text-white font-extrabold text-xl mb-2">
              Permanently End "{event.name}"?
            </Text>
            <Text className="text-slate-300 text-sm leading-relaxed mb-6">
              WARNING: Ending this event permanently locks all Judge terminals and freezes the final
              ledger. Under Open Jury's Zero-Trust rules, an ended event can NEVER be restarted or
              re-opened.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setConfirmEndModal(false)}
                className="flex-1 bg-slate-800 py-3.5 rounded-xl items-center"
              >
                <Text className="text-slate-200 font-bold text-sm">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  updateEventState(id, 'ended');
                  setConfirmEndModal(false);
                }}
                className="flex-1 bg-red-600 active:bg-red-700 py-3.5 rounded-xl items-center"
              >
                <Text className="text-white font-extrabold text-sm">Lock & End Forever</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}