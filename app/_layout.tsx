import 'react-native-get-random-values';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/stores/media-store';
import { Colors } from '@/constants/Colors';

// Custom dark theme matching our design
const ProofSnapDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary[500],
    background: Colors.dark.background,
    card: Colors.dark.card,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

const ProofSnapLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary[500],
    background: Colors.light.background,
    card: Colors.light.card,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { isInitialized, onboardingDone, initialize } = useAppStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingDone && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [isInitialized, onboardingDone, segments]);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? Colors.dark.background : Colors.light.background }}>
        <ActivityIndicator size="large" color={Colors.primary[500]} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? ProofSnapDark : ProofSnapLight}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="verify/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: true,
            headerTitle: 'Verification Details',
            headerTitleStyle: { fontWeight: '800', fontSize: 17 },
            headerTintColor: colorScheme === 'dark' ? Colors.dark.text : Colors.light.text,
            headerStyle: {
              backgroundColor: colorScheme === 'dark' ? Colors.dark.background : Colors.light.background,
            },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="verify-proof"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
      <Toast />
    </ThemeProvider>
  );
}
