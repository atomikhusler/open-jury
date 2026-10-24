// src/components/features/AnimatedLeaderboardRow.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  LinearTransition,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Trophy, AlertTriangle, Sparkles, Users, Award } from 'lucide-react-native';
import { RankedParticipant } from '../../utils/ranking-engine';
import { COLORS } from '../../design-system/colors';

interface AnimatedLeaderboardRowProps {
  item: RankedParticipant;
  maxPossiblePerJudge: number;
  rankingEnabled: boolean;
  isOrganiserView?: boolean;
  onPressManualOverride?: (item: RankedParticipant) => void;
}

export const AnimatedLeaderboardRow: React.FC<AnimatedLeaderboardRowProps> = ({
  item,
  maxPossiblePerJudge,
  rankingEnabled,
  isOrganiserView = false,
  onPressManualOverride,
}) => {
  const {
    participant,
    rank,
    judgeCount,
    rawSum,
    averageScore,
    olympicTrimmedSum,
    primaryDisplayScore,
    needsManualOverride,
    tieResolutionNote,
    manualBonus,
  } = item;

  // Track score changes to trigger a 2-second border/glow pulse when a new score arrives
  const prevScoreRef = useRef<number>(primaryDisplayScore);
  const prevJudgeCountRef = useRef<number>(judgeCount);
  const pulseValue = useSharedValue(0);

  useEffect(() => {
    const scoreChanged = prevScoreRef.current !== primaryDisplayScore;
    const judgeChanged = prevJudgeCountRef.current !== judgeCount;

    if ((scoreChanged || judgeChanged) && judgeCount > 0) {
      pulseValue.value = withSequence(
        withTiming(1, { duration: 250 }),
        withTiming(0.25, { duration: 400 }),
        withTiming(1, { duration: 250 }),
        withTiming(0, { duration: 1100 })
      );
    }

    prevScoreRef.current = primaryDisplayScore;
    prevJudgeCountRef.current = judgeCount;
  }, [primaryDisplayScore, judgeCount, pulseValue]);

  const pulseAnimatedStyle = useAnimatedStyle(() => {
    return {
      borderColor:
        pulseValue.value > 0.05
          ? COLORS.primary
          : needsManualOverride
          ? COLORS.error
          : 'rgba(148, 163, 184, 0.18)',
      transform: [{ scale: 1 + pulseValue.value * 0.012 }],
    };
  });

  // Determine podium styling for Top 3 when ranking is enabled
  const getRankBadgeStyle = () => {
    if (!rankingEnabled || rank === null) {
      return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
    }
    if (rank === 1) {
      return {
        bg: 'bg-amber-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/50',
      };
    }
    if (rank === 2) {
      return {
        bg: 'bg-slate-300/20',
        text: 'text-slate-200',
        border: 'border-slate-300/50',
      };
    }
    if (rank === 3) {
      return {
        bg: 'bg-amber-700/25',
        text: 'text-amber-500',
        border: 'border-amber-600/50',
      };
    }
    return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
  };

  const badge = getRankBadgeStyle();
  const totalMaxAcrossJudges =
    judgeCount > 0 ? maxPossiblePerJudge * judgeCount : maxPossiblePerJudge;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      layout={LinearTransition.springify().damping(14).stiffness(120)}
      style={pulseAnimatedStyle}
      className={`mb-3 rounded-2xl border-2 p-4 ${
        needsManualOverride ? 'bg-red-950/30' : 'bg-slate-900/95'
      }`}
    >
      <View className="flex-row items-center justify-between">
        {/* Left: Rank Badge + Serial No + Participant Identity */}
        <View className="flex-row items-center flex-1 pr-3">
          <View
            className={`w-12 h-12 rounded-xl border items-center justify-center mr-3 ${badge.bg} ${badge.border}`}
          >
            {rankingEnabled && rank !== null ? (
              <View className="items-center">
                {rank <= 3 && <Trophy size={12} color="#fbbf24" />}
                <Text className={`font-extrabold text-base ${badge.text}`}>
                  #{rank}
                </Text>
              </View>
            ) : (
              <Text className="text-slate-400 font-bold text-xs">
                SL {participant.serial_no}
              </Text>
            )}
          </View>

          <View className="flex-1">
            <View className="flex-row items-center flex-wrap gap-2">
              <View className="bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 rounded-md">
                <Text className="text-blue-400 font-bold text-xs">
                  SL #{participant.serial_no}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                className="text-white font-bold text-base md:text-lg"
              >
                {participant.name}
              </Text>
            </View>

            <Text numberOfLines={1} className="text-slate-400 text-xs mt-1">
              {participant.school_name}
              {participant.class_name ? ` • Class ${participant.class_name}` : ''}
              {participant.cluster_name ? ` • ${participant.cluster_name}` : ''}
            </Text>

            {/* Tie-Break or Status Pill */}
            {tieResolutionNote && (
              <View className="flex-row items-center mt-1.5">
                {needsManualOverride ? (
                  <AlertTriangle size={13} color="#ef4444" />
                ) : (
                  <Sparkles size={13} color="#38bdf8" />
                )}
                <Text
                  className={`text-xs font-semibold ml-1.5 ${
                    needsManualOverride ? 'text-red-400' : 'text-sky-400'
                  }`}
                >
                  {tieResolutionNote}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: Live Score Metrics */}
        <View className="items-end">
          {judgeCount === 0 ? (
            <View className="bg-slate-800 px-3 py-1.5 rounded-lg">
              <Text className="text-slate-400 text-xs font-medium">Awaiting Scores</Text>
            </View>
          ) : (
            <>
              <View className="flex-row items-baseline">
                <Text className="text-white font-black text-2xl">
                  {primaryDisplayScore}
                </Text>
                <Text className="text-slate-500 text-xs font-semibold ml-1">
                  / {totalMaxAcrossJudges}
                </Text>
              </View>

              <View className="flex-row items-center gap-2 mt-1">
                <View className="flex-row items-center bg-slate-800 px-2 py-0.5 rounded">
                  <Users size={11} color="#94a3b8" />
                  <Text className="text-slate-300 text-[11px] font-medium ml-1">
                    {judgeCount} {judgeCount === 1 ? 'Judge' : 'Judges'}
                  </Text>
                </View>

                <View className="bg-slate-800 px-2 py-0.5 rounded ml-1.5">
                  <Text className="text-slate-300 text-[11px] font-medium">
                    Avg: {averageScore}
                  </Text>
                </View>

                {judgeCount >= 3 && (
                  <View className="bg-indigo-950/80 border border-indigo-500/30 px-2 py-0.5 rounded ml-1.5">
                    <Text className="text-indigo-300 text-[11px] font-medium">
                      Trim: {olympicTrimmedSum}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* Organiser Manual Tie-Breaker Action Button */}
          {isOrganiserView && (needsManualOverride || manualBonus > 0) && (
            <Pressable
              onPress={() => onPressManualOverride?.(item)}
              className={`mt-2 flex-row items-center px-3 py-1.5 rounded-lg border ${
                manualBonus > 0
                  ? 'bg-emerald-950/60 border-emerald-500/50'
                  : 'bg-red-600 border-red-400'
              }`}
            >
              <Award size={13} color="#ffffff" />
              <Text className="text-white text-xs font-bold ml-1.5">
                {manualBonus > 0 ? 'Modify Override (+0.1)' : 'Break Tie (+0.1)'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
};