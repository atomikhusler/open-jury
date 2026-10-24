// src/components/features/JudgeAccessManager.tsx
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { QrCode, Copy, Share2, Check, UserPlus, KeyRound, ShieldCheck } from 'lucide-react-native';
import { useEventStore } from '../../store/useEventStore';
import { Judge } from '../../types/database.types';

interface JudgeAccessManagerProps {
  orgId: string;
  eventId: string;
  eventName: string;
}

export const JudgeAccessManager: React.FC<JudgeAccessManagerProps> = ({
  orgId,
  eventId,
  eventName,
}) => {
  const { judges, addJudge } = useEventStore();
  const eventJudges = judges.filter((j) => j.assigned_event_ids.includes(eventId));

  const [customId, setCustomId] = useState(`J${eventJudges.length + 1}`);
  const [pin, setPin] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [selectedJudge, setSelectedJudge] = useState<Judge | null>(eventJudges[0] || null);
  const [copiedType, setCopiedType] = useState<'link' | 'creds' | null>(null);

  const qrRef = useRef<any>(null);

  const regeneratePin = () => {
    setPin(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const handleCreateJudge = () => {
    if (!customId.trim() || pin.length !== 4 || isNaN(Number(pin))) {
      Alert.alert('Invalid Credentials', 'Judge ID is required and PIN must be a 4-digit number.');
      return;
    }
    const created = addJudge(orgId, customId, pin, [eventId]);
    setSelectedJudge(created);
    setCustomId(`J${eventJudges.length + 2}`);
    regeneratePin();
  };

  const buildMagicLink = (judge: Judge) => {
    const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://openjury.app';
    return `${baseUrl}/?org=${encodeURIComponent(judge.org_id)}&judge=${encodeURIComponent(
      judge.judge_custom_id
    )}&pin=${encodeURIComponent(judge.pin)}&event=${encodeURIComponent(eventId)}`;
  };

  const handleCopy = async (text: string, type: 'link' | 'creds') => {
    await Clipboard.setStringAsync(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleShareQR = () => {
    if (!qrRef.current || !selectedJudge) return;

    qrRef.current.toDataURL(async (base64Data: string) => {
      try {
        if (Platform.OS === 'web') {
          const link = document.createElement('a');
          link.href = `data:image/png;base64,${base64Data}`;
          link.download = `OpenJury_${selectedJudge.org_id}_${selectedJudge.judge_custom_id}.png`;
          link.click();
          return;
        }

        const fileUri = `${FileSystem.cacheDirectory}Judge_${selectedJudge.judge_custom_id}_QR.png`;
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: `Share QR for ${selectedJudge.judge_custom_id}`,
          });
        }
      } catch (err) {
        Alert.alert('Export Error', 'Unable to export QR image on this device.');
      }
    });
  };

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mt-4">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <QrCode size={20} color="#3b82f6" />
          <Text className="text-white font-bold text-lg ml-2">Judge Access & QR Provisioning</Text>
        </View>
        <Text className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
          {eventJudges.length} Assigned
        </Text>
      </View>

      {/* Judge Generator Row */}
      <View className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 mb-5">
        <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
          Create New Judge Account
        </Text>
        <View className="flex-row gap-3 items-center">
          <View className="flex-1">
            <Text className="text-slate-400 text-xs mb-1">Judge ID</Text>
            <TextInput
              value={customId}
              onChangeText={setCustomId}
              placeholder="e.g. J1, JUDGE-A"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              className="bg-slate-900 border border-slate-700 text-white px-3 py-2.5 rounded-lg font-mono text-sm"
            />
          </View>
          <View className="w-28">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-slate-400 text-xs">4-Digit PIN</Text>
              <Pressable onPress={regeneratePin}>
                <KeyRound size={12} color="#3b82f6" />
              </Pressable>
            </View>
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              className="bg-slate-900 border border-slate-700 text-emerald-400 px-3 py-2.5 rounded-lg font-mono text-sm text-center font-bold tracking-widest"
            />
          </View>
          <Pressable
            onPress={handleCreateJudge}
            className="bg-blue-600 active:bg-blue-700 px-4 py-3 rounded-lg mt-5 flex-row items-center"
          >
            <UserPlus size={16} color="#ffffff" />
            <Text className="text-white font-bold text-sm ml-1.5">Add</Text>
          </Pressable>
        </View>
      </View>

      {/* Existing Judge Pills */}
      {eventJudges.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {eventJudges.map((j) => {
              const isSelected = selectedJudge?.id === j.id;
              return (
                <Pressable
                  key={j.id}
                  onPress={() => setSelectedJudge(j)}
                  className={`px-4 py-2 rounded-xl border flex-row items-center ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <ShieldCheck size={14} color={isSelected ? '#60a5fa' : '#64748b'} />
                  <Text
                    className={`ml-1.5 font-mono font-bold text-sm ${
                      isSelected ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  >
                    {j.judge_custom_id}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Selected Judge QR & Fast-Track Card */}
      {selectedJudge && (
        <View className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex-col md:flex-row items-center justify-between gap-4">
          <View className="bg-white p-3 rounded-xl items-center justify-center">
            <QRCode
              value={buildMagicLink(selectedJudge)}
              size={140}
              backgroundColor="white"
              color="#0f172a"
              getRef={(c) => (qrRef.current = c)}
            />
          </View>

          <View className="flex-1 w-full">
            <Text className="text-slate-400 text-xs uppercase font-bold tracking-wider">
              Fast-Track Credentials ({eventName})
            </Text>
            <View className="flex-row gap-3 my-2.5">
              <View className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg flex-1">
                <Text className="text-slate-500 text-[10px] uppercase">Org ID</Text>
                <Text className="text-white font-mono font-bold text-base">
                  {selectedJudge.org_id}
                </Text>
              </View>
              <View className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg flex-1">
                <Text className="text-slate-500 text-[10px] uppercase">Judge ID</Text>
                <Text className="text-blue-400 font-mono font-bold text-base">
                  {selectedJudge.judge_custom_id}
                </Text>
              </View>
              <View className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg flex-1">
                <Text className="text-slate-500 text-[10px] uppercase">Secret PIN</Text>
                <Text className="text-emerald-400 font-mono font-bold text-base tracking-widest">
                  {selectedJudge.pin}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row flex-wrap gap-2 mt-1">
              <Pressable
                onPress={() =>
                  handleCopy(
                    `Open Jury Login (${eventName})\nOrg ID: ${selectedJudge.org_id}\nJudge ID: ${selectedJudge.judge_custom_id}\nPIN: ${selectedJudge.pin}\nFast-Track Link: ${buildMagicLink(selectedJudge)}`,
                    'creds'
                  )
                }
                className="bg-slate-800 active:bg-slate-700 px-3 py-2.5 rounded-lg flex-row items-center flex-1 justify-center"
              >
                {copiedType === 'creds' ? (
                  <Check size={15} color="#10b981" />
                ) : (
                  <Copy size={15} color="#94a3b8" />
                )}
                <Text className="text-slate-200 text-xs font-semibold ml-1.5">
                  {copiedType === 'creds' ? 'Copied Details!' : 'Copy Details'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleCopy(buildMagicLink(selectedJudge), 'link')}
                className="bg-blue-600/20 border border-blue-500/40 active:bg-blue-600/30 px-3 py-2.5 rounded-lg flex-row items-center flex-1 justify-center"
              >
                {copiedType === 'link' ? (
                  <Check size={15} color="#60a5fa" />
                ) : (
                  <Copy size={15} color="#60a5fa" />
                )}
                <Text className="text-blue-300 text-xs font-semibold ml-1.5">
                  {copiedType === 'link' ? 'Link Copied!' : 'Create Invite Link'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleShareQR}
                className="bg-emerald-600 active:bg-emerald-700 px-3.5 py-2.5 rounded-lg flex-row items-center justify-center"
              >
                <Share2 size={15} color="#ffffff" />
                <Text className="text-white text-xs font-bold ml-1.5">
                  {Platform.OS === 'web' ? 'Download QR' : 'Share QR'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};