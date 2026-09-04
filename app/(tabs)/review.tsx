import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getCasesForReview, updateCase } from '@/lib/db';
import { updateCaseReviewOnSupabase } from '@/lib/supabase';
import { useAppStore } from '@/stores/media-store';
import { VerdictPill, formatConfidence, verdictColor } from '@/components/Verdict';
import type { KYCCase, ReviewStatus } from '@/lib/types';

// The manual-review queue. Everything the pipeline routed to REVIEW lands
// here: a human either approves or rejects, and that outcome is recorded on
// the case (reviewStatus) rather than overwriting the detector's decision.
export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark, colors } = useThemeColors();
  const refreshStats = useAppStore((s) => s.refreshStats);
  const [queue, setQueue] = useState<KYCCase[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setQueue(await getCasesForReview());
    } catch (err) {
      console.warn('Failed to load review queue:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const decide = async (id: string, reviewStatus: ReviewStatus) => {
    Haptics.impactAsync(
      reviewStatus === 'approved'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Heavy
    );
    const updatedAt = new Date().toISOString();
    await updateCase(id, { reviewStatus, updatedAt });
    // Mirror to the shared case file. Non-fatal: the local record already has
    // the decision, and the cloud is optional.
    await updateCaseReviewOnSupabase(id, reviewStatus, updatedAt);
    await load();
    await refreshStats();
  };

  const renderItem = ({ item, index }: { item: KYCCase; index: number }) => {
    const topReason = item.reasons?.[0];
    const pending = item.reviewStatus === 'pending' || item.reviewStatus == null;

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
        <Pressable
          onPress={() => router.push(`/verify/${item.id}` as any)}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
              borderColor: verdictColor(item.decision) + '66',
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.thumbStack}>
            <Image source={{ uri: item.idImageUri }} style={styles.thumbnail} contentFit="cover" transition={200} />
            <Image source={{ uri: item.selfieUri }} style={styles.thumbnail} contentFit="cover" transition={200} />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardHeader}>
              <Text
                style={[styles.cardTitle, { color: verdictColor(item.authenticity) }]}
                numberOfLines={1}
              >
                {item.authenticity?.replace(/_/g, ' ') ?? 'NO VERDICT'}
              </Text>
              <VerdictPill value={item.decision} size="sm" />
            </View>

            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {item.identity ?? 'NOT ASSESSED'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="speedometer-outline" size={12} color={colors.textSecondary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {formatConfidence(item.confidence, item.confidenceIsCalibrated)}
                </Text>
              </View>
            </View>

            {topReason && (
              <View
                style={[
                  styles.reasonBox,
                  { backgroundColor: verdictColor(item.decision) + '14' },
                ]}
              >
                <Text style={[styles.reasonText, { color: colors.text }]} numberOfLines={2}>
                  {topReason.text}
                </Text>
              </View>
            )}

            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>

            {pending ? (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => decide(item.id, 'approved')}
                  style={[styles.actionBtn, { backgroundColor: Colors.success + '1F', borderColor: Colors.success }]}
                >
                  <Ionicons name="checkmark" size={14} color={Colors.success} />
                  <Text style={[styles.actionText, { color: Colors.success }]}>Approve</Text>
                </Pressable>
                <Pressable
                  onPress={() => decide(item.id, 'rejected')}
                  style={[styles.actionBtn, { backgroundColor: Colors.danger + '1F', borderColor: Colors.danger }]}
                >
                  <Ionicons name="close" size={14} color={Colors.danger} />
                  <Text style={[styles.actionText, { color: Colors.danger }]}>Reject</Text>
                </Pressable>
              </View>
            ) : (
              <Text
                style={[
                  styles.reviewedText,
                  {
                    color:
                      item.reviewStatus === 'approved' ? Colors.success : Colors.danger,
                  },
                ]}
              >
                Reviewer {item.reviewStatus}
              </Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const pendingCount = queue.filter(
    (c) => c.reviewStatus === 'pending' || c.reviewStatus == null
  ).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Review</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Cases the detector could not decide
            </Text>
          </View>
          <View
            style={[
              styles.countBadge,
              { backgroundColor: Colors.warning + (isDark ? '22' : '18') },
            ]}
          >
            <Ionicons name="alert-circle" size={16} color={Colors.warning} />
            <Text style={[styles.countText, { color: Colors.warning }]}>{pendingCount}</Text>
          </View>
        </View>

        {/* Stats row */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.statsRow}>
          {[
            { label: 'Queued', value: queue.length, color: Colors.primary[500] },
            { label: 'Pending', value: pendingCount, color: Colors.warning },
            { label: 'Actioned', value: queue.length - pendingCount, color: Colors.success },
          ].map((s) => (
            <View
              key={s.label}
              style={[
                styles.statCard,
                { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated },
              ]}
            >
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      {queue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="checkmark-done-circle-outline"
            size={64}
            color={colors.textSecondary}
            style={{ opacity: 0.4 }}
          />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            Review queue is empty
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Cases land here when the verdict is REVIEW — insufficient evidence,
            an unusable image, or an indeterminate face match.
          </Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary[500]} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingHorizontal: 20, marginBottom: 14 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, marginTop: 3, opacity: 0.7 },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    marginTop: 4,
  },
  countText: { fontSize: 16, fontWeight: '800' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Card
  card: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  thumbStack: { width: 84 },
  thumbnail: { width: 84, height: 76, backgroundColor: '#000' },
  cardInfo: { flex: 1, padding: 12, gap: 5 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', flex: 1, letterSpacing: 0.2 },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 2, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, opacity: 0.8 },
  reasonBox: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 3,
  },
  reasonText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  timeText: { fontSize: 10, marginTop: 3, opacity: 0.6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionText: { fontSize: 11, fontWeight: '800' },
  reviewedText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
    marginTop: 6,
  },

  // List
  listContent: { paddingBottom: 100 },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20, opacity: 0.7 },
});
