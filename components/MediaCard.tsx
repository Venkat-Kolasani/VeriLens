import React from 'react';
import { View, Image, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TrustBadge } from './TrustBadge';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Colors } from '@/constants/Colors';
import type { MediaRecord } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = 20;
const GRID_GAP = 12;
const COLUMNS = 2;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

interface MediaCardProps {
  record: MediaRecord;
}

export function MediaCard({ record }: MediaCardProps) {
  const router = useRouter();
  const { isDark, colors } = useThemeColors();

  const statusColor =
    record.status === 'verified'
      ? Colors.success
      : record.status === 'failed'
      ? Colors.danger
      : Colors.warning;

  return (
    <Pressable
      onPress={() => router.push(`/verify/${record.id}` as any)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: record.fileUri }}
          style={styles.image}
          resizeMode="cover"
        />
        {/* Trust badge overlay */}
        <View style={styles.badgeOverlay}>
          <TrustBadge score={record.trustScore} size="sm" />
        </View>
        {/* Watermark overlay */}
        {record.status === 'verified' && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.cardWatermark}
          >
            <View style={styles.cardWmBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
              <Text style={styles.cardWmText}>Verified</Text>
            </View>
          </LinearGradient>
        )}
        {/* Status indicator */}
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      <View style={styles.info}>
        <Text style={[styles.scoreText, { color: colors.text }]} numberOfLines={1}>
          Score: {record.trustScore}
        </Text>
        <Text style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1}>
          {new Date(record.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

// Small horizontal list card
export function MediaListCard({ record }: MediaCardProps) {
  const router = useRouter();
  const { isDark, colors } = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push(`/verify/${record.id}` as any)}
      style={({ pressed }) => [
        styles.listCard,
        {
          backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Image
        source={{ uri: record.fileUri }}
        style={styles.listImage}
        resizeMode="cover"
      />
      <View style={styles.listInfo}>
        <View style={styles.listTop}>
          <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
            {record.fileType === 'image' ? '📷' : '🎥'} {record.fileName.substring(0, 20)}
          </Text>
          <TrustBadge score={record.trustScore} size="sm" />
        </View>
        <Text style={[styles.listDetail, { color: colors.textSecondary }]}>
          {record.status === 'verified' ? '✓ Verified' : record.status} • Score: {record.trustScore}
        </Text>
        <Text style={[styles.listDate, { color: colors.textSecondary }]}>
          {new Date(record.createdAt).toLocaleString()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: GRID_GAP,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  imageContainer: {
    width: '100%',
    height: CARD_WIDTH,
    position: 'relative',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  statusDot: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  cardWatermark: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingTop: 20,
  },
  cardWmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardWmText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  info: {
    padding: 12,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  dateText: {
    fontSize: 11,
    marginTop: 3,
    opacity: 0.6,
  },
  listCard: {
    flexDirection: 'row',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  listImage: {
    width: 80,
    height: 80,
    backgroundColor: '#000',
  },
  listInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  listTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
    letterSpacing: -0.2,
  },
  listDetail: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  listDate: {
    fontSize: 11,
    marginTop: 2,
    opacity: 0.6,
  },
});
