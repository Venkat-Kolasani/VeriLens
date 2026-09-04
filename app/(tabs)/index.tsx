import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';
import { MediaListCard } from '@/components/MediaCard';

const { width: SCREEN_W } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const { records, stats, publicKey, loadRecords, refreshStats } = useAppStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await Promise.all([loadRecords(), refreshStats()]);
        if (active) setIsLoading(false);
      })();
      return () => { active = false; };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRecords(), refreshStats()]);
    setRefreshing(false);
  };

  const recent = records.slice(0, 5);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary[500]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome to</Text>
            <Text style={[styles.appName, { color: colors.text }]}>ProofSnap</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Proof of Capture
            </Text>
          </View>
          <Pressable
            style={[styles.keyPill, {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.06)',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            }]}
          >
            <View style={[styles.keyDot, { backgroundColor: Colors.success }]} />
            <Ionicons name="key" size={13} color={Colors.primary[500]} />
            <Text style={[styles.keyPillText, { color: Colors.primary[500] }]}>Keys Active</Text>
          </Pressable>
        </Animated.View>

        {/* Stats Cards */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsRow}>
          {[
            { n: stats.total, label: 'Total', colors: isDark ? ['#1E3A8A', '#1D4ED8'] : ['#3B82F6', '#2563EB'], icon: 'camera' },
            { n: stats.verified, label: 'Verified', colors: isDark ? ['#064E3B', '#047857'] : ['#10B981', '#059669'], icon: 'shield-checkmark' },
            { n: stats.onChain, label: 'On-Chain', colors: isDark ? ['#4C1D95', '#6D28D9'] : ['#8B5CF6', '#7C3AED'], icon: 'link' },
          ].map((stat, i) => (
            <LinearGradient
              key={stat.label}
              colors={stat.colors as [string, string]}
              style={styles.statCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.statNumber}>{stat.n}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Ionicons name={stat.icon as any} size={40} color="rgba(255,255,255,0.08)" style={styles.statBgIcon} />
            </LinearGradient>
          ))}
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Pressable
            onPress={() => router.push('/(tabs)/capture')}
            style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <LinearGradient
              colors={['#3B82F6', '#6366F1', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.captureButton}
            >
              <View style={styles.captureIconBg}>
                <Ionicons name="camera" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.captureTextContainer}>
                <Text style={styles.captureButtonText}>Capture & Verify</Text>
                <Text style={styles.captureSubtext}>Take a photo or import from gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Pressable
            onPress={() => router.push('/verify-proof')}
            style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <LinearGradient
              colors={isDark ? ['#047857', '#064E3B'] : ['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.verifyProofButton}
            >
              <View style={styles.captureIconBg}>
                <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.captureTextContainer}>
                <Text style={styles.captureButtonText}>Verify a Proof</Text>
                <Text style={styles.captureSubtext}>Check image authenticity on-chain</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Recent Activity */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
            {records.length > 5 && (
              <Pressable onPress={() => router.push('/(tabs)/gallery')}>
                <Text style={[styles.seeAll, { color: Colors.primary[500] }]}>See All</Text>
              </Pressable>
            )}
          </View>

          {recent.length === 0 ? (
            <View style={[styles.emptyState, {
              backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
            }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)' }]}>
                <Ionicons name="images-outline" size={32} color={Colors.primary[400]} />
              </View>
              <Text style={[styles.emptyText, { color: colors.text }]}>No media verified yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Capture or import a photo to get started
              </Text>
            </View>
          ) : (
            recent.map((record, index) => (
              <Animated.View key={record.id} entering={FadeInRight.delay(500 + index * 80).springify()}>
                <MediaListCard record={record} />
              </Animated.View>
            ))
          )}
        </Animated.View>

        {/* Device Key Info */}
        <Animated.View entering={FadeInDown.delay(650).springify()}>
          <View style={[styles.infoCard, {
            backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
            borderColor: isDark ? Colors.dark.border : Colors.light.border,
          }]}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconCircle, { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)' }]}>
                <Ionicons name="finger-print" size={18} color={Colors.primary[500]} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoTitle, { color: colors.text }]}>Your Device Key</Text>
                <Text style={[styles.infoValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {publicKey ? publicKey.substring(0, 24) + '...' : 'Not generated'}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  greeting: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  appName: { fontSize: 32, fontWeight: '900', marginTop: 2, letterSpacing: -0.8 },
  tagline: { fontSize: 13, fontWeight: '500', marginTop: 2, opacity: 0.7, letterSpacing: 0.3 },
  keyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
  },
  keyDot: { width: 6, height: 6, borderRadius: 3 },
  keyPillText: { fontSize: 11, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    overflow: 'hidden',
    minHeight: 92,
  },
  statNumber: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  statBgIcon: { position: 'absolute', bottom: -6, right: -6 },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    marginBottom: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  verifyProofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    marginBottom: 28,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  captureIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTextContainer: { flex: 1 },
  captureButtonText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  captureSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3, fontWeight: '500' },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  seeAll: { fontSize: 14, fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyText: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptySubtext: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  infoCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '700' },
  infoValue: { fontSize: 12, marginTop: 3, opacity: 0.8 },
});
