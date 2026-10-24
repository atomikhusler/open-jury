// src/components/primitives/NumericSlider.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLORS } from '../../design-system/colors';

interface NumericSliderProps {
  label: string;
  maxMarks: number;
  currentValue: number | null;
  onValueChange: (val: number) => void;
}

export const NumericSlider = ({ label, maxMarks, currentValue, onValueChange }: NumericSliderProps) => {
  // Generate array of possible scores: [0, 1, 2, ..., maxMarks]
  const marks = Array.from({ length: maxMarks + 1 }, (_, i) => i);

  return (
    <View className="bg-jury-surface p-5 rounded-2xl mb-4 border border-slate-700">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-slate-100 font-semibold text-lg">{label}</Text>
        <Text className="text-jury-primary font-bold text-xl">
          {currentValue !== null ? currentValue : '-'} / {maxMarks}
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-2">
        {marks.map((mark) => {
          const isSelected = currentValue === mark;
          return (
            <Pressable
              key={mark}
              onPress={() => onValueChange(mark)}
              className={`h-12 w-12 rounded-full items-center justify-center border-2 
                ${isSelected ? 'bg-jury-primary border-jury-primary' : 'bg-jury-dark border-slate-600'}
              `}
            >
              <Text className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                {mark}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};