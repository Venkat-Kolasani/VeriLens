import React, { useState } from 'react';
import { ActivityIndicator, View, Image, Text, Pressable, StyleSheet, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VerdictPill, formatConfidence, verdictColor } from './Verdict';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';
import { Colors } from '@/constants/Colors';
import type { KYCCase } from '@/lib/types';

/** Re-runs a failed case's analysis (same pipeline capture.tsx's retry
 *  button calls) without needing to re-capture photos. Shared by both card
 *  variants below since a failed case can show up in either. */
function useRetryFailedCase(kycCase: KYCCase) {
  const startKycCheck = useAppStore((s) => s.startKycCheck);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await startKycCheck(kycCase.idImageUri, kycCase.selfieUri, kycCase.idImageAttested);
    } catch (err: any) {
      Alert.alert('Retry Failed', err?.message ?? 'Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  return { retrying, retry };
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = 20;
const GRID_GAP = 12;
const COLUMNS = 2;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

interface CaseCardProps {
  kycCase: KYCCase;
}

const statusColor = (status: KYCCase['status']) =>
  status === 'complete'
    ? Colors.success
    : status === 'failed'
    ? Colors.danger
    : Colors.warning;

export function CaseCard({ kycCase }: CaseCardProps) {
  const router = useRouter();
  const { isDark, colors } = useThemeColors();
  const { retrying, retry } = useRetryFailedCase(kycCase);

  return (
    <Pressable
      onPress={() => router.push(`/verify/${kycCase.id}` as any)}
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
        {/* ID document behind, selfie inset — a case is always two images */}
        <Image source={{ uri: kycCase.idImageUri }} style={styles.image} resizeMode="cover" />
        <Image source={{ uri: kycCase.selfieUri }} style={styles.selfieInset} resizeMode="cover" />

        <View style={styles.badgeOverlay}>
          <VerdictPill value={kycCase.decision} size="sm" />
        </View>

        {kycCase.anchorTx && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.cardWatermark}
          >
            <View style={styles.cardWmBadge}>
              <Ionicons name="link" size={10} color="#FFFFFF" />
              <Text style={styles.cardWmText}>Anchored</Text>
            </View>
          </LinearGradient>
        )}

        <View style={[styles.statusDot, { backgroundColor: statusColor(kycCase.status) }]} />

        {kycCase.status === 'failed' && (
          <Pressable
            onPress={retry}
            disabled={retrying}
            hitSlop={8}
            style={[styles.retryButton, { backgroundColor: Colors.primary[500] }]}
          >
            {retrying ? (
              <ActivityIndicator size="small" color="#0A0A0A" />
            ) : (
              <Ionicons name="refresh" size={16} color="#0A0A0A" />
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.axisText, { color: verdictColor(kycCase.authenticity) }]}
          numberOfLines={1}
        >
          {kycCase.authenticity?.replace(/_/g, ' ') ?? 'NO VERDICT'}
        </Text>
        <Text style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1}>
          {new Date(kycCase.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

// Small horizontal list card
export function CaseListCard({ kycCase }: CaseCardProps) {
  const router = useRouter();
  const { isDark, colors } = useThemeColors();
  const { retrying, retry } = useRetryFailedCase(kycCase);
  const topReason = kycCase.reasons?.[0]?.text;

  return (
    <Pressable
      onPress={() => router.push(`/verify/${kycCase.id}` as any)}
      style={({ pressed }) => [
        styles.listCard,
        {
          backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Image source={{ uri: kycCase.selfieUri }} style={styles.listImage} resizeMode="cover" />
      <View style={styles.listInfo}>
        <View style={styles.listTop}>
          <Text
            style={[styles.listTitle, { color: verdictColor(kycCase.authenticity) }]}
            numberOfLines={1}
          >
            {kycCase.authenticity?.replace(/_/g, ' ') ?? 'NO VERDICT'}
          </Text>
          <VerdictPill value={kycCase.decision} size="sm" />
        </View>
        <Text style={[styles.listDetail, { color: colors.textSecondary }]} numberOfLines={1}>
          {kycCase.identity ? `Identity ${kycCase.identity}` : 'Identity not assessed'} ·{' '}
          {formatConfidence(kycCase.confidence, kycCase.confidenceIsCalibrated)}
        </Text>
        {topReason ? (
          <Text style={[styles.listReason, { color: colors.textSecondary }]} numberOfLines={1}>
            {topReason}
          </Text>
        ) : null}
        <Text style={[styles.listDate, { color: colors.textSecondary }]}>
          {new Date(kycCase.createdAt).toLocaleString()}
        </Text>
      </View>

      {kycCase.status === 'failed' && (
        <Pressable
          onPress={retry}
          disabled={retrying}
          hitSlop={8}
          style={[styles.listRetryButton, { backgroundColor: Colors.primary[500] }]}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#0A0A0A" />
          ) : (
            <Ionicons name="refresh" size={18} color="#0A0A0A" />
          )}
        </Pressable>
      )}
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
  selfieInset: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 40,
    height: 52,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: '#000',
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
  retryButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRetryButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
  axisText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
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
    height: 100,
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
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
    marginRight: 8,
    letterSpacing: 0.2,
  },
  listDetail: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  listReason: {
    fontSize: 11,
    marginTop: 3,
    opacity: 0.75,
  },
  listDate: {
    fontSize: 11,
    marginTop: 3,
    opacity: 0.6,
  },
});
