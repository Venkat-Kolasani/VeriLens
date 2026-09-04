import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';

const { width, height } = Dimensions.get('window');

const pages = [
  {
    icon: 'shield-checkmark' as const,
    title: 'Your Media,\nProven Real',
    description:
      'Every photo and video you capture gets a unique cryptographic fingerprint — proving it hasn\'t been tampered with.',
    gradient: ['#1E3A8A', '#3B82F6'] as [string, string],
  },
  {
    icon: 'link' as const,
    title: 'Blockchain\nAnchored',
    description:
      'Your media proof is permanently recorded on a decentralized blockchain. Immutable, transparent, and verifiable by anyone.',
    gradient: ['#064E3B', '#10B981'] as [string, string],
  },
  {
    icon: 'eye' as const,
    title: 'AI Verified\nAuthenticity',
    description:
      'Advanced AI analyzes your media for deepfakes, manipulation, and plagiarism. Get a trust score you can share.',
    gradient: ['#4C1D95', '#8B5CF6'] as [string, string],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const setupKeys = useAppStore((state) => state.setupKeys);
  const flatListRef = useRef<FlatList>(null);

  const handleGetStarted = async () => {
    setIsSettingUp(true);
    try {
      await setupKeys();
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Setup failed:', error);
      setIsSettingUp(false);
    }
  };

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
    }
  };

  const renderPage = ({ item, index }: { item: typeof pages[0]; index: number }) => (
    <View style={[styles.page, { width }]}>
      <LinearGradient
        colors={item.gradient}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View
          entering={FadeInDown.delay(300 + index * 100).springify()}
          style={styles.iconContainer}
        >
          <Ionicons name={item.icon} size={80} color="rgba(255,255,255,0.95)" />
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(500 + index * 100).springify()}
          style={styles.title}
        >
          {item.title}
        </Animated.Text>

        <Animated.Text
          entering={FadeInDown.delay(700 + index * 100).springify()}
          style={styles.description}
        >
          {item.description}
        </Animated.Text>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentPage(page);
        }}
        keyExtractor={(_, i) => i.toString()}
      />

      {/* Bottom controls */}
      <View style={styles.bottomContainer}>
        {/* Page dots */}
        <View style={styles.dotsContainer}>
          {pages.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    currentPage === index
                      ? '#FFFFFF'
                      : 'rgba(255,255,255,0.3)',
                  width: currentPage === index ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Action button */}
        {currentPage === pages.length - 1 ? (
          <Animated.View entering={FadeInUp.springify()}>
            <Pressable
              onPress={handleGetStarted}
              disabled={isSettingUp}
              style={({ pressed }) => [
                styles.getStartedButton,
                { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
            >
              {isSettingUp ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#1E3A8A" />
                  <Text style={styles.getStartedText}>  Generating Keys...</Text>
                </View>
              ) : (
                <Text style={styles.getStartedText}>Get Started</Text>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.nextButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.nextText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </Pressable>
        )}

        {/* Skip */}
        {currentPage < pages.length - 1 && (
          <Pressable
            onPress={() =>
              flatListRef.current?.scrollToIndex({
                index: pages.length - 1,
                animated: true,
              })
            }
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  page: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  getStartedButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 220,
    alignItems: 'center',
  },
  getStartedText: {
    color: '#1E3A8A',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    padding: 8,
  },
  skipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
});
