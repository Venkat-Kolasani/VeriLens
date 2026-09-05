import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import type {
  Authenticity,
  Decision,
  Identity,
  LaneOut,
  VerdictReason,
} from '@/lib/types';

// The three axes replace the old 0-100 trust score. There is no aggregate
// number on purpose: authenticity, identity and the operator decision can
// disagree, and collapsing them hides exactly the case a reviewer needs.

type AxisValue = Authenticity | Identity | Decision | null;

/** ACCEPT/REAL/MATCH green · REJECT/LIKELY_FAKE/MISMATCH red · everything
 *  indeterminate amber. Null (not assessed) is neutral grey. */
export function verdictColor(value: AxisValue): string {
  switch (value) {
    case 'ACCEPT':
    case 'REAL':
    case 'MATCH':
      return Colors.success;
    case 'REJECT':
    case 'LIKELY_FAKE':
    case 'MISMATCH':
      return Colors.danger;
    case 'REVIEW':
    case 'INSUFFICIENT_EVIDENCE':
    case 'INDETERMINATE':
      return Colors.warning;
    default:
      return '#8A8A8A';
  }
}

export function verdictIcon(value: AxisValue): keyof typeof Ionicons.glyphMap {
  const color = verdictColor(value);
  if (color === Colors.success) return 'checkmark-circle';
  if (color === Colors.danger) return 'close-circle';
  if (color === Colors.warning) return 'alert-circle';
  return 'help-circle';
}

export function axisLabel(value: AxisValue): string {
  return value ? value.replace(/_/g, ' ') : 'NOT ASSESSED';
}

/** Confidence is not a probability until the service says it is calibrated.
 *  Until then it is rendered as a bare number, explicitly flagged. */
export function formatConfidence(
  confidence: number | null,
  isCalibrated: boolean
): string {
  if (confidence == null) return 'no confidence reported';
  return isCalibrated
    ? `${(confidence * 100).toFixed(0)}% confidence`
    : `confidence ${confidence.toFixed(2)} (uncalibrated)`;
}

// ──────────────── Compact pill (cards, list rows) ────────────────

export function VerdictPill({
  value,
  size = 'md',
}: {
  value: AxisValue;
  size?: 'sm' | 'md';
}) {
  const color = verdictColor(value);
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: color + '20',
          borderColor: color,
          paddingHorizontal: small ? 7 : 10,
          paddingVertical: small ? 3 : 5,
        },
      ]}
    >
      <Ionicons name={verdictIcon(value)} size={small ? 10 : 13} color={color} />
      <Text style={[styles.pillText, { color, fontSize: small ? 9 : 11 }]}>
        {axisLabel(value)}
      </Text>
    </View>
  );
}

// ──────────────── The three axes ────────────────

export function VerdictAxes({
  authenticity,
  identity,
  decision,
  confidence,
  isCalibrated,
}: {
  authenticity: Authenticity | null;
  identity: Identity | null;
  decision: Decision | null;
  confidence: number | null;
  /** The case's stored confidenceIsCalibrated (service:
   *  verdict.confidence_is_calibrated). Required, not defaulted: guessing
   *  this is how a bare number ends up read as a probability. */
  isCalibrated: boolean;
}) {
  const { isDark, colors } = useThemeColors();

  const axes: { key: string; label: string; value: AxisValue }[] = [
    { key: 'authenticity', label: 'Authenticity', value: authenticity },
    { key: 'identity', label: 'Identity', value: identity },
    { key: 'decision', label: 'Decision', value: decision },
  ];

  return (
    <View style={styles.axesWrap}>
      <View style={styles.axesRow}>
        {axes.map((axis, i) => {
          const color = verdictColor(axis.value);
          return (
            <Animated.View
              key={axis.key}
              entering={FadeInDown.delay(i * 80).springify()}
              style={[
                styles.axisCard,
                {
                  backgroundColor: color + (isDark ? '18' : '12'),
                  borderColor: color + '55',
                },
              ]}
            >
              <Ionicons name={verdictIcon(axis.value)} size={22} color={color} />
              <Text style={[styles.axisValue, { color }]} numberOfLines={2}>
                {axisLabel(axis.value)}
              </Text>
              <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>
                {axis.label}
              </Text>
            </Animated.View>
          );
        })}
      </View>
      <Text style={[styles.confidence, { color: colors.textSecondary }]}>
        {formatConfidence(confidence, isCalibrated)}
      </Text>
    </View>
  );
}

// ──────────────── Per-lane explanation ────────────────

const SEVERITY_COLOR: Record<VerdictReason['severity'], string> = {
  info: '#8A8A8A',
  warn: Colors.warning,
  critical: Colors.danger,
};

/** The explainability IS the product: always render it, and say plainly when
 *  there is nothing to render. */
export function VerdictReasons({
  reasons,
  lanes,
}: {
  reasons: VerdictReason[] | null;
  lanes?: LaneOut[] | null;
}) {
  const { colors } = useThemeColors();

  if (!reasons || reasons.length === 0) {
    return (
      <Text style={[styles.noReasons, { color: colors.textSecondary }]}>
        No reasons reported for this case.
      </Text>
    );
  }

  // E/J/Q reasons never appear in `lanes` (that list is only the per-image
  // forensic lanes A/B/C) -- without this map they'd render as a bare
  // letter instead of a readable name.
  const NON_LANE_NAMES: Record<string, string> = {
    E: 'Face Match',
    J: 'Judge',
    Q: 'Quality Gate',
  };
  const laneName = (lane: string) =>
    lanes?.find((l) => l.lane === lane)?.name ?? NON_LANE_NAMES[lane] ?? lane;

  return (
    <View style={styles.reasonList}>
      {reasons.map((reason, i) => {
        const color = SEVERITY_COLOR[reason.severity] ?? '#8A8A8A';
        return (
          <View key={`${reason.lane}-${i}`} style={styles.reasonRow}>
            <View style={[styles.reasonDot, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.reasonLane, { color }]}>
                {laneName(reason.lane)}
              </Text>
              <Text style={[styles.reasonText, { color: colors.text }]}>
                {reason.text}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Per-lane scores, shown alongside the reasons on the detail screen. */
export function LaneScores({ lanes }: { lanes: LaneOut[] | null }) {
  const { isDark, colors } = useThemeColors();

  if (!lanes || lanes.length === 0) {
    return (
      <Text style={[styles.noReasons, { color: colors.textSecondary }]}>
        No detector lanes ran for this case.
      </Text>
    );
  }

  return (
    <View style={{ width: '100%' }}>
      {lanes.map((lane, i) => (
        <View key={`${lane.lane}-${i}`} style={styles.laneRow}>
          <View style={styles.laneHeader}>
            <Text style={[styles.laneName, { color: colors.text }]} numberOfLines={1}>
              {lane.name}
            </Text>
            <Text
              style={[
                styles.laneScore,
                { color: lane.usable ? colors.text : colors.textSecondary },
              ]}
            >
              {lane.usable ? lane.score.toFixed(2) : 'unusable'}
            </Text>
          </View>
          <View
            style={[
              styles.laneTrack,
              { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated },
            ]}
          >
            <View
              style={[
                styles.laneFill,
                {
                  width: `${Math.min(Math.max(lane.score, 0), 1) * 100}%`,
                  backgroundColor: lane.usable
                    ? lane.score > 0.5
                      ? Colors.danger
                      : Colors.success
                    : '#8A8A8A',
                },
              ]}
            />
          </View>
          {lane.reasons.length > 0 && (
            <Text style={[styles.laneReason, { color: colors.textSecondary }]}>
              {lane.reasons.join(' · ')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillText: { fontWeight: '900', letterSpacing: 0.4 },

  axesWrap: { width: '100%', gap: 10 },
  axesRow: { flexDirection: 'row', gap: 8 },
  axisCard: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  axisValue: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  axisLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  confidence: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.85,
  },

  // width: '100%' makes this self-sufficient regardless of the parent's
  // alignItems -- a parent using anything but the RN default 'stretch'
  // (e.g. 'center') stops passing its width down to children, and the
  // reason rows below rely on that width via flex: 1. Found live: the
  // post-capture "Why" card reused a shared card style with
  // alignItems: 'center', collapsing this view's width to its own content
  // size and making every reason's text render at zero width (invisible)
  // while the fixed-size severity dot next to it still showed.
  reasonList: { width: '100%', gap: 10 },
  reasonRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  reasonDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  reasonLane: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  noReasons: { fontSize: 13, fontWeight: '500', opacity: 0.8 },

  laneRow: { marginBottom: 12 },
  laneHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  laneName: { fontSize: 12, fontWeight: '700', flex: 1, marginRight: 8 },
  laneScore: { fontSize: 12, fontWeight: '800' },
  laneTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  laneFill: { height: 6, borderRadius: 3 },
  laneReason: { fontSize: 11, marginTop: 4, lineHeight: 16, opacity: 0.85 },
});
