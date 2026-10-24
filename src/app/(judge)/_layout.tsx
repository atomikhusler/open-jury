// src/app/(judge)/_layout.tsx
import React, { useEffect } from 'react';
import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { ShieldCheck, LogOut, Wifi, WifiOff, CloudUpload } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { OfflineToast } from '../../components/primitives/OfflineToast';
import { Judge } from '../../types/database.types';

export default function JudgeLayout() {
  const router = useRouter();
  const { role, user, logout } = useAuthStore();
  const { isOnline, pendingSubmissions, setOnlineStatus, flushQueue } = useSyncStore();

  // 1. OS-Level Event-Driven Network Listener (Battery Efficient)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnlineStatus(online);
      if (online) {
        flushQueue();
      }
    });

    return () => unsubscribe();
  }, [setOnlineStatus, flushQueue]);

  // 2. Role Guard (Redirects to "/" if not logged in as Judge)
  useEffect(() => {
    if (role !== 'judge') {
      router.replace('/');
    }
  }, [role, router]);

  const judgeUser = user as Judge | null;

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      {/* Universal Brave-Style Offline Warning Banner */}
      <OfflineToast />

      {/* Top Judge Status Bar */}
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 items-center justify-center mr-2.5">
            <ShieldCheck size={20} color="#3b82f6" />
          </View>
          <View>
            <Text className="text-white font-extrabold text-sm">
              {judgeUser?.judge_custom_id || 'JUDGE TERMINAL'}
            </Text>
            <Text className="text-slate-400 text-[11px] font-medium">
              ORG: {judgeUser?.org_id || 'OD2026'}
            </Text>
          </View>
        </View>

        {/* Right Status Badges & Logout */}
        <View className="flex-row items-center space-x-2">
          {/* Pending Offline Sync Counter */}
          {pendingSubmissions > 0 && (
            <View className="flex-row items-center bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-full mr-2">
              <CloudUpload size={13} color="#f59e0b" />
              <Text className="text-amber-400 text-xs font-bold ml-1">
                {pendingSubmissions} Queued
              </Text>
            </View>
          )}

          {/* Live Network Pill */}
          <View
            className={`flex-row items-center px-2.5 py-1 rounded-full border mr-2 ${
              isOnline
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : 'bg-red-500/20 border-red-500/40'
            }`}
          >
            {isOnline ? (
              <Wifi size={13} color="#10b981" />
            ) : (
              <WifiOff size={13} color="#ef4444" />
            )}
            <Text
              className={`text-xs font-bold ml-1 ${
                isOnline ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>

          {/* Logout Button */}
          <Pressable
            onPress={handleLogout}
            className="p-2 bg-slate-800 rounded-xl border border-slate-700"
          >
            <LogOut size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* Main Terminal Content */}
      <View className="flex-1">
        <Slot />
      </View>
    </SafeAreaView>
  );
}