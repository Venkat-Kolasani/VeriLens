import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  Share,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/theme';
import { BLOCK_EXPLORER, CHAIN_ID, CHAIN_NAME, CHAIN_RPC } from '@/constants/config';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getCaseById } from '@/lib/db';
import type { KYCCase } from '@/lib/types';
import {
  LaneScores,
  VerdictAxes,
  VerdictPill,
  VerdictReasons,
  formatConfidence,
  verdictColor,
} from '@/components/Verdict';

const { width } = Dimensions.get('window');

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, colors } = useThemeColors();
  const [kycCase, setCase] = useState<KYCCase | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    reasons: true,
    lanes: true,
    crypto: false,
    signature: false,
    anchor: true,
    device: false,
  });

  useEffect(() => {
    if (id) {
      getCaseById(id).then(setCase);
    }
  }, [id]);

  if (!kycCase) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyText = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', `${label} copied to clipboard.`);
    } catch {}
  };

  const handleShare = async () => {
    try {
      const anchorLine = kycCase.anchorTx
        ? `\nAnchored: ${BLOCK_EXPLORER}/tx/${kycCase.anchorTx}`
        : '\nAnchor: not on-chain';
      await Share.share({
        message:
          `VeriLens KYC case ${kycCase.id}\n\n` +
          `Authenticity: ${kycCase.authenticity ?? 'NO VERDICT'}\n` +
          `Identity: ${kycCase.identity ?? 'NOT ASSESSED'}\n` +
          `Decision: ${kycCase.decision ?? 'NONE'}\n` +
          `${formatConfidence(kycCase.confidence, kycCase.confidenceIsCalibrated)}\n` +
          `ID image SHA-256: ${kycCase.idImageSha256}\n` +
          `Selfie SHA-256: ${kycCase.selfieSha256}\n` +
          `Verdict digest: ${kycCase.anchorPayloadHash ?? 'not computed'}` +
          anchorLine,
      });
    } catch {}
  };

  const Section = ({
    id: sectionId,
    icon,
    title,
    children,
    delay = 0,
  }: {
    id: string;
    icon: string;
    title: string;
    children: React.ReactNode;
    delay?: number;
  }) => (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <View
        style={[
          styles.section,
          {
            backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
            borderColor: isDark ? Colors.dark.border : Colors.light.border,
          },
        ]}
      >
        <Pressable onPress={() => toggleSection(sectionId)} style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name={icon as any} size={18} color={colors.tint} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          </View>
          <Ionicons
            name={expandedSections[sectionId] ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        {expandedSections[sectionId] && <View style={styles.sectionContent}>{children}</View>}
      </View>
    </Animated.View>
  );

  const DataRow = ({
    label,
    value,
    onCopy,
    mono,
  }: {
    label: string;
    value: string;
    onCopy?: () => void;
    /** Raw forensic data (hashes, tx hashes, signatures, keys, case IDs) reads
     *  as data, not prose — render it in the mono font instead of the UI sans. */
    mono?: boolean;
  }) => (
    <View style={styles.dataRow}>
      <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.dataValueRow}>
        <Text
          style={[styles.dataValue, { color: colors.text }, mono && { fontFamily: Fonts?.mono }]}
          numberOfLines={1}
          selectable
        >
          {value}
        </Text>
        {onCopy && (
          <Pressable onPress={onCopy} style={styles.copyBtn}>
            <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const statusLabel =
    kycCase.status === 'complete'
      ? 'Complete'
      : kycCase.status === 'failed'
      ? 'No verdict'
      : kycCase.status === 'analyzing'
      ? 'Analyzing'
      : 'Pending';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero: the two images that make the case */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={styles.heroContainer}>
            <View style={styles.heroPane}>
              <Image source={{ uri: kycCase.idImageUri }} style={styles.heroImage} resizeMode="cover" />
              <Text style={styles.heroCaption}>
                ID document{kycCase.idImageAttested ? ' · camera' : ' · imported'}
              </Text>
            </View>
            <View style={styles.heroPane}>
              <Image source={{ uri: kycCase.selfieUri }} style={styles.heroImage} resizeMode="cover" />
              <Text style={styles.heroCaption}>
                Selfie · camera
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    kycCase.status === 'complete'
                      ? Colors.success
                      : kycCase.status === 'failed'
                      ? Colors.danger
                      : Colors.warning,
                },
              ]}
            >
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          </View>
        </Animated.View>

        {/* The three axes */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.axesContainer}>
          <VerdictAxes
            authenticity={kycCase.authenticity}
            identity={kycCase.identity}
            decision={kycCase.decision}
            confidence={kycCase.confidence}
            isCalibrated={kycCase.confidenceIsCalibrated}
          />
          {kycCase.reviewStatus && (
            <View style={styles.reviewRow}>
              <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>
                Manual review
              </Text>
              <VerdictPill
                value={
                  kycCase.reviewStatus === 'approved'
                    ? 'ACCEPT'
                    : kycCase.reviewStatus === 'rejected'
                    ? 'REJECT'
                    : 'REVIEW'
                }
                size="sm"
              />
            </View>
          )}
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.actionsRow}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: Colors.primary[500], opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={18} color="#0A0A0A" />
            <Text style={[styles.actionButtonText, { color: '#0A0A0A' }]}>Share Case</Text>
          </Pressable>

          {kycCase.anchorTx && (
            <Pressable
              onPress={() => setShowTxModal(true)}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Ionicons name="open-outline" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>View On-Chain</Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Why — the explanation is the product */}
        <Section id="reasons" icon="list" title="Why this verdict" delay={400}>
          <VerdictReasons reasons={kycCase.reasons} lanes={kycCase.lanes} />
        </Section>

        {/* Per-lane detector scores */}
        <Section id="lanes" icon="pulse" title="Detector lanes" delay={500}>
          <LaneScores lanes={kycCase.lanes} />
        </Section>

        {/* On-chain anchor */}
        <Section id="anchor" icon="link" title="Verdict anchor" delay={600}>
          <DataRow
            label="Verdict digest (SHA-256)"
            value={kycCase.anchorPayloadHash ?? 'Not computed'}
            onCopy={
              kycCase.anchorPayloadHash
                ? () => copyText(kycCase.anchorPayloadHash!, 'Verdict digest')
                : undefined
            }
            mono
          />
          <DataRow
            label="Transaction Hash"
            value={kycCase.anchorTx ?? 'Not anchored'}
            onCopy={kycCase.anchorTx ? () => copyText(kycCase.anchorTx!, 'Tx Hash') : undefined}
            mono
          />
          <DataRow label="Block Number" value={kycCase.anchorBlock?.toString() ?? '—'} mono />
          <DataRow label="Network" value={CHAIN_NAME} />
          <Text style={[styles.anchorNote, { color: colors.textSecondary }]}>
            The digest covers both image hashes, the three axes, the confidence and
            the lane scores — the verdict, not the images.
          </Text>
        </Section>

        {/* Image hashes */}
        <Section id="crypto" icon="finger-print" title="Image hashes" delay={700}>
          <DataRow
            label="ID document (SHA-256)"
            value={kycCase.idImageSha256 || '—'}
            onCopy={
              kycCase.idImageSha256
                ? () => copyText(kycCase.idImageSha256, 'ID hash')
                : undefined
            }
            mono
          />
          <DataRow
            label="Selfie (SHA-256)"
            value={kycCase.selfieSha256 || '—'}
            onCopy={
              kycCase.selfieSha256 ? () => copyText(kycCase.selfieSha256, 'Selfie hash') : undefined
            }
            mono
          />
          {kycCase.idImageUrl && (
            <DataRow
              label="ID image URL"
              value={kycCase.idImageUrl}
              onCopy={() => copyText(kycCase.idImageUrl!, 'ID image URL')}
            />
          )}
          {kycCase.selfieUrl && (
            <DataRow
              label="Selfie URL"
              value={kycCase.selfieUrl}
              onCopy={() => copyText(kycCase.selfieUrl!, 'Selfie URL')}
            />
          )}
        </Section>

        {/* Device Ed25519 proof over the image-pair digest */}
        <Section id="signature" icon="key" title="Device signature" delay={750}>
          <DataRow
            label="Signature (Ed25519)"
            value={kycCase.signature || 'Not signed'}
            onCopy={
              kycCase.signature ? () => copyText(kycCase.signature, 'Signature') : undefined
            }
            mono
          />
          <DataRow
            label="Device public key"
            value={kycCase.publicKey || 'No device key'}
            onCopy={
              kycCase.publicKey ? () => copyText(kycCase.publicKey, 'Public key') : undefined
            }
            mono
          />
          <Text style={[styles.anchorNote, { color: colors.textSecondary }]}>
            Signed over the two image hashes concatenated, with this device's key.
            The same signature is submitted alongside the verdict digest when the
            case is anchored.
          </Text>
        </Section>

        {/* Device Info */}
        <Section id="device" icon="phone-portrait" title="Case metadata" delay={800}>
          <DataRow label="Case ID" value={kycCase.id} mono />
          <DataRow label="Platform" value={kycCase.deviceInfo || 'Unknown'} />
          <DataRow label="Created" value={new Date(kycCase.createdAt).toLocaleString()} />
          <DataRow label="Updated" value={new Date(kycCase.updatedAt).toLocaleString()} />
          <DataRow
            label="ID document capture"
            value={kycCase.idImageAttested ? 'This device camera' : 'Imported from gallery'}
          />
          <DataRow
            label="Selfie attestation (Lane D)"
            value={
              kycCase.selfieAttested
                ? 'Device-signed and sent for server verification'
                : 'Not attempted — never held against the verdict'
            }
          />
        </Section>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* On-Chain Transaction Detail Modal */}
      <Modal
        visible={showTxModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTxModal(false)}
      >
        <View style={styles.txModalOverlay}>
          <View
            style={[
              styles.txModalContent,
              {
                backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
                borderColor: isDark ? Colors.dark.border : Colors.light.border,
              },
            ]}
          >
            <View style={styles.txModalHeader}>
              <View
                style={[
                  styles.txModalIconBg,
                  { backgroundColor: verdictColor(kycCase.decision) },
                ]}
              >
                <Ionicons name="cube" size={28} color="#FFFFFF" />
              </View>
              <Text style={[styles.txModalTitle, { color: colors.text }]}>Anchored Verdict</Text>
              <Text style={[styles.txModalSubtitle, { color: colors.textSecondary }]}>
                Recorded on {CHAIN_NAME}
              </Text>
            </View>

            <ScrollView style={styles.txModalBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Transaction Hash</Text>
                <Pressable onPress={() => copyText(kycCase.anchorTx!, 'Tx Hash')} style={styles.txCopyRow}>
                  <Text style={[styles.txDetailValue, { color: colors.text }]} numberOfLines={2}>
                    {kycCase.anchorTx}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={colors.tint} />
                </Pressable>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Block Number</Text>
                <Text style={[styles.txDetailValue, { color: colors.text }]}>
                  {kycCase.anchorBlock?.toString() ?? 'Pending'}
                </Text>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Network</Text>
                <View style={styles.txNetworkRow}>
                  <View style={[styles.txNetworkDot, { backgroundColor: Colors.success }]} />
                  <Text style={[styles.txDetailValue, { color: colors.text }]}>{CHAIN_NAME}</Text>
                </View>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Chain ID</Text>
                <Text style={[styles.txDetailValue, { color: colors.text }]}>{CHAIN_ID}</Text>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>RPC Endpoint</Text>
                <Pressable onPress={() => copyText(CHAIN_RPC, 'RPC URL')} style={styles.txCopyRow}>
                  <Text style={[styles.txDetailValue, { color: colors.text }]} numberOfLines={1}>
                    {CHAIN_RPC}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={colors.tint} />
                </Pressable>
              </View>

              <View style={[styles.txDetailRow, { borderColor: 'transparent' }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>
                  Verdict digest (anchored)
                </Text>
                <Pressable
                  onPress={() => copyText(kycCase.anchorPayloadHash ?? '', 'Verdict digest')}
                  style={styles.txCopyRow}
                >
                  <Text style={[styles.txDetailValue, { color: colors.text }]} numberOfLines={1}>
                    {kycCase.anchorPayloadHash ?? '—'}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={colors.tint} />
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.txModalActions}>
              <Pressable
                onPress={() => {
                  Linking.openURL(`${BLOCK_EXPLORER}/tx/${kycCase.anchorTx}`).catch(() => {
                    Alert.alert(
                      'Explorer Error',
                      'Could not open the Sepolia block explorer. Please try again later.'
                    );
                  });
                }}
                style={[styles.txModalBtn, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
              >
                <Ionicons name="globe-outline" size={16} color={colors.text} />
                <Text style={[styles.txModalBtnText, { color: colors.text }]}>View on Explorer</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowTxModal(false)}
                style={[styles.txModalBtn, { backgroundColor: Colors.primary[500] }]}
              >
                <Ionicons name="checkmark" size={16} color="#0A0A0A" />
                <Text style={[styles.txModalBtnText, { color: '#0A0A0A' }]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 20 },
  heroContainer: {
    width: width,
    height: width * 0.62,
    flexDirection: 'row',
    gap: 2,
    position: 'relative',
    backgroundColor: '#000',
  },
  heroPane: { flex: 1, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  statusPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  axesContainer: { paddingHorizontal: 16, paddingVertical: 20, gap: 12 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#F5C400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  dataRow: { marginBottom: 12 },
  dataLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  dataValueRow: { flexDirection: 'row', alignItems: 'center' },
  dataValue: { fontSize: 13, fontWeight: '600', flex: 1 },
  copyBtn: { padding: 4, marginLeft: 6 },
  anchorNote: { fontSize: 11, lineHeight: 16, opacity: 0.75 },
  // Tx Modal styles
  txModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  txModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  txModalHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  txModalIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  txModalTitle: { fontSize: 20, fontWeight: '800' },
  txModalSubtitle: { fontSize: 13, marginTop: 4 },
  txModalBody: { paddingHorizontal: 20 },
  txDetailRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txDetailLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  txDetailValue: { fontSize: 14, fontWeight: '500', fontFamily: Fonts?.mono },
  txCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txNetworkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txNetworkDot: { width: 8, height: 8, borderRadius: 4 },
  txModalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  txModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  txModalBtnText: { fontSize: 14, fontWeight: '700' },
});
