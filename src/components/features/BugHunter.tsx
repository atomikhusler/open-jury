//src/components/features/BugHunter.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react-native';

interface BugHunterProps {
  error: Error;
  retry: () => void;
}

export function BugHunter({ error, retry }: BugHunterProps) {
  const [copied, setCopied] = useState(false);

  const errorLog = `
TIMESTAMP: ${new Date().toISOString()}
ERROR: ${error.name}
MESSAGE: ${error.message}
STACK TRACE:
${error.stack}
  `.trim();

  const handleCopy = async () => {
    await Clipboard.setStringAsync(errorLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView className="flex-1 bg-jury-dark">
      <View className="p-4 border-b border-jury-error/30 bg-jury-error/10 flex-row items-center space-x-3">
        <AlertTriangle color="#ef4444" size={28} />
        <View>
          <Text className="text-jury-error font-bold text-lg">CRITICAL CRASH INTERCEPTED</Text>
          <Text className="text-gray-400 text-sm">Open Jury Bug Hunter</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="bg-jury-surface p-4 rounded-lg border border-gray-700">
          <Text className="text-red-400 font-bold mb-2 text-lg">{error.name}: {error.message}</Text>
          <Text className="text-gray-300 font-mono text-xs leading-5">
            {error.stack}
          </Text>
        </View>
      </ScrollView>

      <View className="p-4 border-t border-gray-800 flex-row space-x-4">
        <TouchableOpacity 
          onPress={handleCopy}
          className="flex-1 bg-gray-800 py-4 rounded-xl flex-row justify-center items-center space-x-2"
        >
          <Copy color={copied ? "#4ade80" : "#9ca3af"} size={20} />
          <Text className={copied ? "text-green-400 font-bold" : "text-gray-400 font-bold"}>
            {copied ? "COPIED TO CLIPBOARD" : "COPY FULL LOG"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={retry}
          className="flex-1 bg-jury-primary py-4 rounded-xl flex-row justify-center items-center space-x-2"
        >
          <RefreshCw color="#ffffff" size={20} />
          <Text className="text-white font-bold">RELOAD APP</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}