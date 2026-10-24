// src/app/(organiser)/_layout.tsx
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { ShieldAlert, LogOut, LayoutDashboard } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { OfflineToast } from '../../components/primitives/OfflineToast';
import { Organisation } from '../../types/database.types';

export default function OrganiserLayout() {
  const { role, user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (role !== 'organiser') {
      router.replace('/');
    }
  }, [role]);

  if (role !== 'organiser') return null;

  const org = user as Organisation | null;

  return (
    <View className="flex-1 bg-slate-950">
      <OfflineToast />

      {/* Top Command Bar */}
      <View className="bg-slate-900 border-b border-slate-800 px-5 pt-10 pb-3.5 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.push('/(organiser)/dashboard')}
          className="flex-row items-center"
        >
          <View className="w-9 h-9 rounded-xl bg-blue-600 items-center justify-center mr-3">
            <LayoutDashboard size={18} color="#ffffff" />
          </View>
          <View>
            <View className="flex-row items-center">
              <Text className="text-white font-extrabold text-base tracking-tight">
                OPEN JURY
              </Text>
              <View className="bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded ml-2">
                <Text className="text-amber-300 text-[10px] font-bold uppercase">
                  Read-Only Ledger
                </Text>
              </View>
            </View>
            <Text className="text-slate-400 text-xs font-mono">
              ORG: {org?.id || 'OD2026'} • {org?.email || 'admin@openjury.app'}
            </Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-3">
          {pathname !== '/dashboard' && (
            <Pressable
              onPress={() => router.push('/(organiser)/dashboard')}
              className="bg-slate-800 px-3 py-2 rounded-lg"
            >
              <Text className="text-slate-200 text-xs font-semibold">All Events</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              logout();
              router.replace('/');
            }}
            className="bg-red-500/15 border border-red-500/30 px-3 py-2 rounded-lg flex-row items-center"
          >
            <LogOut size={14} color="#f87171" />
            <Text className="text-red-400 text-xs font-bold ml-1.5">Exit</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content Slot */}
      <View className="flex-1">
        <Slot />
      </View>
    </View>
  );
}