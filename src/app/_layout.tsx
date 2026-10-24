// src/app/_layout.tsx

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '../global.css'; // Ensure this path correctly points to your global.css
import { BugHunter } from '../components/features/BugHunter';

export const ErrorBoundary = BugHunter;
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
