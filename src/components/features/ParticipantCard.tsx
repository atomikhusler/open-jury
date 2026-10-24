// src/components/features/ParticipantCard.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { School, Layers, MapPin, GraduationCap, CheckCircle2 } from 'lucide-react-native';
import { Participant } from '../../types/database.types';

interface ParticipantCardProps {
  participant: Participant;
  isSubmitted?: boolean;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  isSubmitted = false,
}) => {
  return (
    <View className="bg-slate-800 border border-slate-700 rounded-2xl p-4 mb-4 shadow-lg">
      <View className="flex-row items-center justify-between">
        {/* Serial Number Badge */}
        <View className="flex-row items-center space-x-3">
          <View className="bg-blue-600/20 border border-blue-500/40 px-3.5 py-2 rounded-xl items-center justify-center">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
              SL. NO.
            </Text>
            <Text className="text-2xl font-black text-white leading-tight">
              #{participant.serial_no}
            </Text>
          </View>

          {/* Name & School */}
          <View className="ml-3 flex-1">
            <Text className="text-xl font-extrabold text-white" numberOfLines={1}>
              {participant.name}
            </Text>
            <View className="flex-row items-center mt-1">
              <School size={14} color="#94a3b8" />
              <Text className="text-sm text-slate-300 ml-1.5 font-medium" numberOfLines={1}>
                {participant.school_name}
              </Text>
            </View>
          </View>
        </View>

        {/* Locked Status Badge */}
        {isSubmitted && (
          <View className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex-row items-center">
            <CheckCircle2 size={14} color="#10b981" />
            <Text className="text-xs font-bold text-emerald-400 ml-1">LOCKED</Text>
          </View>
        )}
      </View>

      {/* Optional Metadata Row (Class, Cluster, Block) */}
      {(participant.class_name || participant.cluster_name || participant.block_name) && (
        <View className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/60">
          {participant.class_name && (
            <View className="flex-row items-center bg-slate-900/80 px-2.5 py-1 rounded-lg">
              <GraduationCap size={12} color="#60a5fa" />
              <Text className="text-xs text-slate-300 ml-1.5">
                Class: {participant.class_name}
              </Text>
            </View>
          )}
          {participant.cluster_name && (
            <View className="flex-row items-center bg-slate-900/80 px-2.5 py-1 rounded-lg">
              <Layers size={12} color="#60a5fa" />
              <Text className="text-xs text-slate-300 ml-1.5">
                {participant.cluster_name}
              </Text>
            </View>
          )}
          {participant.block_name && (
            <View className="flex-row items-center bg-slate-900/80 px-2.5 py-1 rounded-lg">
              <MapPin size={12} color="#60a5fa" />
              <Text className="text-xs text-slate-300 ml-1.5">
                {participant.block_name}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};