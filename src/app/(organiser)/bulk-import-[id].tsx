// src/app/(organiser)/bulk-import-[id].tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react-native';
import { parseParticipantExcelBase64 } from '../../utils/excel-parser';
import { useEventStore } from '../../store/useEventStore';
import { Participant } from '../../types/database.types';

export default function BulkImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { events, bulkAddParticipants } = useEventStore();

  const event = events.find((e) => e.id === id);

  const [previewRows, setPreviewRows] = useState<Omit<Participant, 'id' | 'event_id'>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  // Single Manual Entry State (as requested in PRD: both one-by-one and bulk)
  const [serialNo, setSerialNo] = useState('');
  const [name, setName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [className, setClassName] = useState('');
  const [clusterName, setClusterName] = useState('');
  const [blockName, setBlockName] = useState('');

  const handlePickExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setFileName(asset.name);

      let base64Content = '';

      if (Platform.OS === 'web') {
        if (asset.uri.startsWith('data:')) {
          base64Content = asset.uri;
        } else if (asset.file) {
          base64Content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(asset.file as Blob);
          });
        }
      } else {
        base64Content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const parsed = parseParticipantExcelBase64(base64Content);
      setPreviewRows(parsed.validRows);
      setParseErrors(parsed.errors);
    } catch (err: any) {
      setParseErrors([`File read error: ${err?.message || 'Unknown error'}`]);
    }
  };

  const handleAddManualRow = () => {
    const parsedSerial = parseInt(serialNo, 10);
    if (isNaN(parsedSerial) || parsedSerial <= 0 || !name.trim() || !schoolName.trim()) {
      setParseErrors(['Manual Entry requires a valid Sl. No., Participant Name, and School Name.']);
      return;
    }
    setPreviewRows((prev) =>
      [
        ...prev,
        {
          serial_no: parsedSerial,
          name: name.trim(),
          school_name: schoolName.trim(),
          class_name: className.trim() || undefined,
          cluster_name: clusterName.trim() || undefined,
          block_name: blockName.trim() || undefined,
        },
      ].sort((a, b) => a.serial_no - b.serial_no)
    );
    setSerialNo(String(parsedSerial + 1));
    setName('');
    setSchoolName('');
    setParseErrors([]);
  };

  const handleCommitImport = () => {
    if (!id || previewRows.length === 0) return;
    bulkAddParticipants(id, previewRows);
    router.replace(`/(organiser)/event-${id}`);
  };

  return (
    <ScrollView className="flex-1 bg-slate-950 p-5">
      <Pressable
        onPress={() => router.back()}
        className="flex-row items-center mb-4 self-start bg-slate-900 px-3 py-2 rounded-lg"
      >
        <ArrowLeft size={16} color="#94a3b8" />
        <Text className="text-slate-300 text-xs font-semibold ml-1.5">Back to Event</Text>
      </Pressable>

      <Text className="text-white text-2xl font-extrabold">
        Import Competitors • {event?.name || id}
      </Text>
      <Text className="text-slate-400 text-xs mt-1 mb-5">
        Expected Excel Columns: Event Name | Sl. No. | Name of the Participant | Class (Opt) |
        School Name | Cluster Name (Opt) | Block Name (Opt)
      </Text>

      {/* Excel Dropzone */}
      <Pressable
        onPress={handlePickExcel}
        className="bg-slate-900 border-2 border-dashed border-blue-500/50 active:border-blue-400 rounded-2xl p-6 items-center justify-center mb-5"
      >
        <UploadCloud size={36} color="#3b82f6" />
        <Text className="text-white font-bold text-base mt-2">
          {fileName ? `Loaded: ${fileName}` : 'Select .xlsx Competition Sheet'}
        </Text>
        <Text className="text-slate-400 text-xs mt-1">
          100% Client-Side Parsing • Instant Zero-Server Validation
        </Text>
      </Pressable>

      {/* One-by-One Manual Addition Card */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
        <Text className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-3">
          Or Add Single Participant Manually
        </Text>
        <View className="flex-row flex-wrap gap-2.5">
          <TextInput
            value={serialNo}
            onChangeText={(t) => setSerialNo(t.replace(/[^0-9]/g, ''))}
            placeholder="Sl. No. *"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg w-20 font-mono text-xs"
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Participant Name *"
            placeholderTextColor="#64748b"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg flex-1 min-w-[150px] text-xs"
          />
          <TextInput
            value={schoolName}
            onChangeText={setSchoolName}
            placeholder="School Name *"
            placeholderTextColor="#64748b"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg flex-1 min-w-[150px] text-xs"
          />
          <TextInput
            value={className}
            onChangeText={setClassName}
            placeholder="Class (Opt)"
            placeholderTextColor="#64748b"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg w-24 text-xs"
          />
          <TextInput
            value={clusterName}
            onChangeText={setClusterName}
            placeholder="Cluster (Opt)"
            placeholderTextColor="#64748b"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg w-28 text-xs"
          />
          <TextInput
            value={blockName}
            onChangeText={setBlockName}
            placeholder="Block (Opt)"
            placeholderTextColor="#64748b"
            className="bg-slate-950 border border-slate-800 text-white px-3 py-2.5 rounded-lg w-28 text-xs"
          />
          <Pressable
            onPress={handleAddManualRow}
            className="bg-blue-600 active:bg-blue-700 px-4 py-2.5 rounded-lg flex-row items-center justify-center"
          >
            <UserPlus size={14} color="#ffffff" />
            <Text className="text-white font-bold text-xs ml-1.5">Add Row</Text>
          </Pressable>
        </View>
      </View>

      {/* Error Warnings */}
      {parseErrors.length > 0 && (
        <View className="bg-red-950/50 border border-red-500/40 rounded-xl p-4 mb-5">
          <View className="flex-row items-center mb-2">
            <AlertCircle size={16} color="#f87171" />
            <Text className="text-red-400 font-bold text-xs ml-1.5">
              Validation Notices ({parseErrors.length})
            </Text>
          </View>
          {parseErrors.map((err, i) => (
            <Text key={i} className="text-red-300 text-xs font-mono mb-1">
              • {err}
            </Text>
          ))}
        </View>
      )}

      {/* Preview Table */}
      {previewRows.length > 0 && (
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-10">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <FileSpreadsheet size={18} color="#10b981" />
              <Text className="text-white font-bold text-base ml-2">
                Ready to Import ({previewRows.length} Valid Rows)
              </Text>
            </View>
            <Pressable
              onPress={handleCommitImport}
              className="bg-emerald-600 active:bg-emerald-700 px-5 py-2.5 rounded-xl flex-row items-center"
            >
              <CheckCircle2 size={16} color="#ffffff" />
              <Text className="text-white font-extrabold text-xs ml-1.5">
                Confirm & Save Competitors
              </Text>
            </Pressable>
          </View>

          <View className="gap-2">
            {previewRows.map((row, index) => (
              <View
                key={`${row.serial_no}-${index}`}
                className="bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-lg flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1">
                  <Text className="text-blue-400 font-mono font-bold text-xs w-12">
                    #{row.serial_no}
                  </Text>
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-xs">{row.name}</Text>
                    <Text className="text-slate-400 text-[11px]">
                      {row.school_name}
                      {row.class_name ? ` • Class ${row.class_name}` : ''}
                    </Text>
                  </View>
                </View>
                <Text className="text-slate-500 text-[11px] font-mono">
                  {[row.cluster_name, row.block_name].filter(Boolean).join(' / ')}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}