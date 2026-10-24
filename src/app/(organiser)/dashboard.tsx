// src/app/(organiser)/dashboard.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Plus,
  Users,
  Sliders,
  ChevronRight,
  PlayCircle,
  PauseCircle,
  Lock,
  FileEdit,
  Award,
} from 'lucide-react-native';
import { useEventStore } from '../../store/useEventStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Event, EventState, Organisation } from '../../types/database.types';

const TIE_BREAKER_OPTIONS: { value: Event['tie_breaker_method']; label: string; desc: string }[] = [
  { value: 'weighted', label: 'Weighted Criterion', desc: 'Priority criterion score breaks ties automatically' },
  { value: 'olympic_trim', label: 'Olympic Trim', desc: 'Drops highest & lowest judge marks for tied competitors' },
  { value: 'timestamp', label: 'Timestamp Advantage', desc: 'Earlier scored performance wins the tie' },
  { value: 'shared', label: 'Shared Placement', desc: 'Awards identical rank and skips next position' },
  { value: 'manual', label: 'Chief Judge Override', desc: 'Flags tie in yellow for +0.1 manual resolution' },
];

export default function OrganiserDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { events, criteriaByEvent, participantsByEvent, createEvent, loadEventForContext } =
    useEventStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [tieBreaker, setTieBreaker] = useState<Event['tie_breaker_method']>('weighted');

  const orgId = (user as Organisation)?.id || 'OD2026';

  const handleCreate = () => {
    if (!newEventName.trim()) return;
    const created = createEvent(newEventName, orgId, tieBreaker);
    setNewEventName('');
    setModalVisible(false);
    loadEventForContext(created.id);
    router.push(`/(organiser)/event-${created.id}`);
  };

  const renderStateBadge = (state: EventState) => {
    switch (state) {
      case 'active':
        return (
          <View className="bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 rounded-full flex-row items-center">
            <PlayCircle size={12} color="#10b981" />
            <Text className="text-emerald-400 text-xs font-bold ml-1 uppercase">Live Scoring</Text>
          </View>
        );
      case 'paused':
        return (
          <View className="bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-full flex-row items-center">
            <PauseCircle size={12} color="#f59e0b" />
            <Text className="text-amber-400 text-xs font-bold ml-1 uppercase">Paused</Text>
          </View>
        );
      case 'ended':
        return (
          <View className="bg-red-500/20 border border-red-500/40 px-2.5 py-1 rounded-full flex-row items-center">
            <Lock size={12} color="#ef4444" />
            <Text className="text-red-400 text-xs font-bold ml-1 uppercase">Ended & Locked</Text>
          </View>
        );
      default:
        return (
          <View className="bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full flex-row items-center">
            <FileEdit size={12} color="#94a3b8" />
            <Text className="text-slate-300 text-xs font-bold ml-1 uppercase">Draft Setup</Text>
          </View>
        );
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-950 p-5">
      {/* Header Banner */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-white text-2xl font-extrabold">Competition Events</Text>
          <Text className="text-slate-400 text-sm mt-0.5">
            Configure rubrics, import participants, and control live event states.
          </Text>
        </View>
        <Pressable
          onPress={() => setModalVisible(true)}
          className="bg-blue-600 active:bg-blue-700 px-4 py-3 rounded-xl flex-row items-center shadow-lg"
        >
          <Plus size={18} color="#ffffff" />
          <Text className="text-white font-bold text-sm ml-1.5">New Event</Text>
        </Pressable>
      </View>

      {/* Event Cards Grid */}
      <View className="gap-4">
        {events.map((evt) => {
          const critList = criteriaByEvent[evt.id] || [];
          const partList = participantsByEvent[evt.id] || [];
          const maxScore = critList.reduce((sum, c) => sum + c.max_marks, 0);

          return (
            <Pressable
              key={evt.id}
              onPress={() => {
                loadEventForContext(evt.id);
                router.push(`/(organiser)/event-${evt.id}`);
              }}
              className="bg-slate-900 border border-slate-800 active:border-blue-500/60 rounded-2xl p-5"
            >
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-white font-extrabold text-lg">{evt.name}</Text>
                  <Text className="text-slate-500 text-xs font-mono mt-0.5">ID: {evt.id}</Text>
                </View>
                {renderStateBadge(evt.state)}
              </View>

              <View className="flex-row items-center justify-between border-t border-slate-800/80 pt-3 mt-1">
                <View className="flex-row items-center gap-5">
                  <View className="flex-row items-center">
                    <Users size={15} color="#60a5fa" />
                    <Text className="text-slate-300 text-xs font-semibold ml-1.5">
                      {partList.length} Competitors
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Sliders size={15} color="#a78bfa" />
                    <Text className="text-slate-300 text-xs font-semibold ml-1.5">
                      {critList.length} Criteria ({maxScore} Marks)
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Award size={15} color="#fbbf24" />
                    <Text className="text-slate-400 text-xs ml-1.5 capitalize">
                      Tie: {evt.tie_breaker_method.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <ChevronRight size={18} color="#64748b" />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Create Event Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/75 items-center justify-center p-5">
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <Text className="text-white font-extrabold text-xl mb-1">Create Competition Event</Text>
            <Text className="text-slate-400 text-xs mb-4">
              Events start in Draft mode until you configure rubrics and open scoring.
            </Text>

            <Text className="text-slate-300 text-xs font-bold uppercase mb-1.5">Event Name</Text>
            <TextInput
              value={newEventName}
              onChangeText={setNewEventName}
              placeholder="e.g., Senior Group Folk Dance"
              placeholderTextColor="#64748b"
              className="bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl mb-4 text-sm"
            />

            <Text className="text-slate-300 text-xs font-bold uppercase mb-2">
              Default Tie-Breaker Rule
            </Text>
            <View className="gap-2 mb-6">
              {TIE_BREAKER_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setTieBreaker(opt.value)}
                  className={`p-3 rounded-xl border ${
                    tieBreaker === opt.value
                      ? 'bg-blue-600/15 border-blue-500'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <Text
                    className={`font-bold text-xs ${
                      tieBreaker === opt.value ? 'text-blue-400' : 'text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </Text>
                  <Text className="text-slate-400 text-[11px] mt-0.5">{opt.desc}</Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setModalVisible(false)}
                className="flex-1 bg-slate-800 py-3 rounded-xl items-center"
              >
                <Text className="text-slate-300 font-bold text-sm">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                className="flex-1 bg-blue-600 py-3 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-sm">Create Event</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}