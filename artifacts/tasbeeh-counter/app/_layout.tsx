import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync();
const FONT_LOAD_TIMEOUT_MS = 1500;
const queryClient = new QueryClient();
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setFontLoadTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);
  useEffect(() => { if (fontsLoaded || fontError || fontLoadTimedOut) void SplashScreen.hideAsync(); }, [fontLoadTimedOut, fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError && !fontLoadTimedOut) return null;
  return <SafeAreaProvider><ErrorBoundary><QueryClientProvider client={queryClient}><GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><Stack screenOptions={{ headerShown: false }} /></KeyboardProvider></GestureHandlerRootView></QueryClientProvider></ErrorBoundary></SafeAreaProvider>;
}
