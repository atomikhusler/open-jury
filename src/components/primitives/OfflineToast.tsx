// src/components/primitives/OfflineToast.tsx
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { WifiOff } from 'lucide-react-native';
import { useSyncStore } from '../../store/useSyncStore';

export const OfflineToast = () => {
  const isOnline = useSyncStore((state) => state.isOnline);
  const pendingSubmissions = useSyncStore((state) => state.pendingSubmissions);
  const translateY = useSharedValue(-100);

  useEffect(() => {
    // Slide down when offline, slide up when online
    translateY.value = withSpring(isOnline ? -100 : 0, {
      damping: 12,
      stiffness: 90,
    });
  }, [isOnline]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View 
      style={animatedStyle}
      className="absolute top-0 left-0 right-0 z-50 bg-jury-error pt-12 pb-4 px-4 flex-row items-center justify-center shadow-lg"
    >
      <WifiOff color="white" size={20} className="mr-2" />
      <View>
        <Text className="text-white font-bold text-base">⚠️ You are offline.</Text>
        <Text className="text-white text-xs opacity-90">
          {pendingSubmissions > 0 
            ? `${pendingSubmissions} score(s) queued locally. Reconnect to sync.` 
            : `Scores will be queued locally until reconnected.`}
        </Text>
      </View>
    </Animated.View>
  );
};