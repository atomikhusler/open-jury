// src/components/features/SmartSearch.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { Search, X, CheckCircle2, ChevronRight } from 'lucide-react-native';
import { useEventStore } from '../../store/useEventStore';
import { Participant } from '../../types/database.types';

interface SmartSearchProps {
  visible: boolean;
  onClose: () => void;
}

export const SmartSearch: React.FC<SmartSearchProps> = ({ visible, onClose }) => {
  const [query, setQuery] = useState('');
  const {
    participants,
    activeParticipant,
    submittedParticipantIds,
    setActiveParticipant,
  } = useEventStore();

  const filteredParticipants = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return participants;

    return participants.filter(
      (p) =>
        p.serial_no.toString().includes(cleanQuery) ||
        p.name.toLowerCase().includes(cleanQuery) ||
        p.school_name.toLowerCase().includes(cleanQuery)
    );
  }, [query, participants]);

  const handleSelect = (participant: Participant) => {
    setActiveParticipant(participant);
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/75 justify-end">
        <View className="bg-slate-900 border-t border-slate-700 rounded-t-3xl h-[80%] p-5">
          {/* Modal Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-lg font-extrabold text-white">
                Select Participant
              </Text>
              <Text className="text-xs text-slate-400">
                Search by Sl. No., Name, or School ({submittedParticipantIds.length}/{participants.length} Scored)
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="p-2 bg-slate-800 rounded-full border border-slate-700"
            >
              <X size={20} color="#cbd5e1" />
            </Pressable>
          </View>

          {/* Search Input Bar */}
          <View className="flex-row items-center bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 mb-4">
            <Search size={18} color="#94a3b8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Type Sl. No. (e.g. 4) or participant name..."
              placeholderTextColor="#64748b"
              className="flex-1 text-white text-base ml-2.5 outline-none"
              autoFocus={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <X size={16} color="#94a3b8" />
              </Pressable>
            )}
          </View>

          {/* Participant List */}
          <FlatList
            data={filteredParticipants}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-12 items-center">
                <Text className="text-slate-400 text-sm">
                  No matching participant found.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = activeParticipant?.id === item.id;
              const isScored = submittedParticipantIds.includes(item.id);

              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  className={`flex-row items-center justify-between p-3.5 mb-2.5 rounded-xl border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-slate-800/90 border-slate-700/80'
                  }`}
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${
                        isSelected ? 'bg-blue-600' : 'bg-slate-700'
                      }`}
                    >
                      <Text className="text-white font-black text-sm">
                        #{item.serial_no}
                      </Text>
                    </View>
                    <View className="flex-1 pr-2">
                      <Text
                        className="text-white font-bold text-base"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        className="text-slate-400 text-xs mt-0.5"
                        numberOfLines={1}
                      >
                        {item.school_name}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center">
                    {isScored ? (
                      <View className="flex-row items-center bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full mr-2">
                        <CheckCircle2 size={13} color="#10b981" />
                        <Text className="text-[11px] font-bold text-emerald-400 ml-1">
                          Scored
                        </Text>
                      </View>
                    ) : (
                      <View className="bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-full mr-2">
                        <Text className="text-[11px] font-bold text-amber-400">
                          Pending
                        </Text>
                      </View>
                    )}
                    <ChevronRight size={18} color="#64748b" />
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};