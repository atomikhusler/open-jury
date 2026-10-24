// src/app/index.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { ShieldCheck, QrCode } from 'lucide-react-native';
import { useEventStore } from '../store/useEventStore';

export default function UnifiedAuthScreen() {
  const router = useRouter();
  const { role, isLoading, error, authenticateJudgeWithCloud, signInOrganiserWithCloud, signUpOrganiserWithCloud } = useAuthStore();
  const activeEvent = useEventStore((state) => state.activeEvent);

  const [activeTab, setActiveTab] = useState<'judge' | 'organiser'>('judge');
  const [isSignUp, setIsSignUp] = useState(false);

  // Judge Form State
  const [judgeOrgId, setJudgeOrgId] = useState('');
  const [judgeId, setJudgeId] = useState('');
  const [judgePin, setJudgePin] = useState('');

  // Organiser Form State
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPassword, setOrgPassword] = useState('');
  const [newOrgId, setNewOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');

  // Auto-redirect if already logged in
  useEffect(() => {
    if (role === 'judge') {
      const eventId = activeEvent?.id || '1';
      router.replace(`/(judge)/terminal-${eventId}` as any);
    }
    if (role === 'organiser') router.replace('/(organiser)/dashboard');
  }, [role, router, activeEvent]);

  const handleJudgeLogin = async () => {
    if (!judgeOrgId || !judgeId || !judgePin) return;
    const success = await authenticateJudgeWithCloud(judgeOrgId, judgeId, judgePin);
    if (success) {
      const eventId = useEventStore.getState().activeEvent?.id || '1';
      router.replace(`/(judge)/terminal-${eventId}` as any);
    }
  };

  const handleOrganiserAuth = async () => {
    if (isSignUp) {
      if (!newOrgId || !newOrgName || !orgEmail || !orgPassword) return;
      const success = await signUpOrganiserWithCloud(newOrgId, newOrgName, orgEmail, orgPassword);
      if (success) router.replace('/(organiser)/dashboard');
    } else {
      if (!orgEmail || !orgPassword) return;
      const success = await signInOrganiserWithCloud(orgEmail, orgPassword);
      if (success) router.replace('/(organiser)/dashboard');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#020617' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="items-center mb-10">
          <Text className="text-white font-black text-4xl mb-2 tracking-tight">Open Jury</Text>
          <View className="flex-row items-center bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20">
            <ShieldCheck size={14} color="#3b82f6" />
            <Text className="text-blue-400 font-bold text-xs ml-1.5 uppercase tracking-widest">Zero-Trust Terminal</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View className="flex-row bg-slate-900 p-1 rounded-xl mb-8">
          <Pressable
            onPress={() => setActiveTab('judge')}
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === 'judge' ? 'bg-slate-800 shadow-sm' : ''}`}
          >
            <Text className={`font-bold ${activeTab === 'judge' ? 'text-white' : 'text-slate-500'}`}>Judge Login</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('organiser')}
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === 'organiser' ? 'bg-blue-600 shadow-sm' : ''}`}
          >
            <Text className={`font-bold ${activeTab === 'organiser' ? 'text-white' : 'text-slate-500'}`}>Organiser</Text>
          </Pressable>
        </View>

        {/* Error Banner */}
        {error && (
          <View className="bg-red-950/50 border border-red-500/50 p-3 rounded-xl mb-4">
            <Text className="text-red-400 text-sm text-center font-medium">{error}</Text>
          </View>
        )}

        {/* JUDGE TAB */}
        {activeTab === 'judge' && (
          <View className="gap-4">
            <View className="bg-slate-900 border border-slate-800 rounded-2xl p-6 items-center mb-2">
              <View className="bg-slate-800 p-4 rounded-full mb-3">
                <QrCode size={32} color="#94a3b8" />
              </View>
              <Text className="text-white font-bold text-base">Scan QR Code</Text>
              <Text className="text-slate-400 text-xs text-center mt-1">Ask your organiser for your secure magic link or QR code to log in instantly.</Text>
            </View>

            <View className="flex-row items-center justify-center gap-4 mb-2">
              <View className="h-[1px] bg-slate-800 flex-1" />
              <Text className="text-slate-500 font-bold text-xs">OR ENTER DETAILS</Text>
              <View className="h-[1px] bg-slate-800 flex-1" />
            </View>

            <TextInput
              value={judgeOrgId}
              onChangeText={setJudgeOrgId}
              placeholder="Org ID (e.g. OD2026)"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
            />
            <TextInput
              value={judgeId}
              onChangeText={setJudgeId}
              placeholder="Judge ID"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
            />
            <TextInput
              value={judgePin}
              onChangeText={setJudgePin}
              placeholder="4-Digit PIN"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold tracking-widest"
            />

            <Pressable
              onPress={handleJudgeLogin}
              disabled={isLoading}
              className="bg-slate-100 active:bg-slate-300 py-4 rounded-xl items-center mt-4 shadow-lg"
            >
              {isLoading ? <ActivityIndicator color="#0f172a" /> : <Text className="text-slate-950 font-black text-base">Login as Judge</Text>}
            </Pressable>
          </View>
        )}

        {/* ORGANISER TAB */}
        {activeTab === 'organiser' && (
          <View className="gap-4">
            {isSignUp && (
              <>
                <TextInput
                  value={newOrgId}
                  onChangeText={setNewOrgId}
                  placeholder="Create Org ID (e.g. MH4012)"
                  placeholderTextColor="#64748b"
                  autoCapitalize="characters"
                  maxLength={6}
                  className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
                />
                <TextInput
                  value={newOrgName}
                  onChangeText={setNewOrgName}
                  placeholder="Organisation Name"
                  placeholderTextColor="#64748b"
                  className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
                />
              </>
            )}

            <TextInput
              value={orgEmail}
              onChangeText={setOrgEmail}
              placeholder="Email Address"
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
              className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
            />
            <TextInput
              value={orgPassword}
              onChangeText={setOrgPassword}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              className="bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl font-bold"
            />

            <Pressable
              onPress={handleOrganiserAuth}
              disabled={isLoading}
              className="bg-blue-600 active:bg-blue-700 py-4 rounded-xl items-center mt-4 shadow-lg shadow-blue-900/20"
            >
              {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text className="text-white font-black text-base">{isSignUp ? 'Create Account' : 'Sign In'}</Text>}
            </Pressable>

            <Pressable onPress={() => setIsSignUp(!isSignUp)} className="py-4 items-center">
              <Text className="text-blue-400 font-semibold text-sm">
                {isSignUp ? 'Already have an account? Sign In' : 'Create new Organiser Account'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
