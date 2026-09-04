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
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, GRADES, getGrade } from '@/constants/Colors';
import { BLOCK_EXPLORER, CHAIN_ID, CHAIN_NAME, CHAIN_RPC } from '@/constants/config';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getRecordById } from '@/lib/db';
import type { MediaRecord } from '@/lib/types';
import { TrustScoreCircle } from '@/components/TrustScoreCircle';

const { width } = Dimensions.get('window');

export default function VerifyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, colors } = useThemeColors();
  const [record, setRecord] = useState<MediaRecord | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    crypto: true,
    blockchain: true,
    ai: true,
    originality: false,
    device: false,
  });

  useEffect(() => {
    if (id) {
      getRecordById(id).then(setRecord);
    }
  }, [id]);

  if (!record) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  const grade = getGrade(record.trustScore);
  const gradeInfo = GRADES[grade];

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
      const imageUrlLine = record.imageUrl
        ? `\nImage URL: ${record.imageUrl}`
        : '';
      const txLine = record.blockchainTx
        ? `\nBlockchain Tx: ${record.blockchainTx}`
        : '\nBlockchain: Pending';
      const explorerLine = record.blockchainTx
        ? `\nExplorer: ${BLOCK_EXPLORER}/tx/${record.blockchainTx}`
        : '';

      await Share.share({
        message: `VeriLens Verification\n\nTrust Score: ${record.trustScore}/100 (Grade ${record.trustGrade})\nFile Hash: ${record.fileHash}${txLine}${explorerLine}${imageUrlLine}\n\nVerified by VeriLens - Proof of Capture`,
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
            <Ionicons name={icon as any} size={18} color={Colors.primary[500]} />
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

  const DataRow = ({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) => (
    <View style={styles.dataRow}>
      <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.dataValueRow}>
        <Text style={[styles.dataValue, { color: colors.text }]} numberOfLines={1} selectable>
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

  const ScoreBar = ({ label, score, color }: { label: string; score: number; color: string }) => (
    <View style={styles.scoreBarContainer}>
      <View style={styles.scoreBarHeader}>
        <Text style={[styles.scoreBarLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.scoreBarValue, { color }]}>{(score * 100).toFixed(1)}%</Text>
      </View>
      <View style={[styles.scoreBarTrack, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}>
        <View style={[styles.scoreBarFill, { width: `${Math.min(score * 100, 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero Image */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={styles.heroContainer}>
            <Image source={{ uri: record.fileUri }} style={styles.heroImage} resizeMode="cover" />
            {/* Watermark overlay preview */}
            <View style={styles.watermarkOverlay}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)']}
                style={styles.watermarkGradient}
              >
                <View style={styles.watermarkBadge}>
                  <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
                  <Text style={styles.watermarkText}>VeriLens Verified</Text>
                  <Text style={styles.watermarkScore}>
                    {record.trustScore}/100
                  </Text>
                </View>
                <Text style={styles.watermarkHash}>
                  #{record.fileHash.substring(0, 12)}
                </Text>
              </LinearGradient>
            </View>
            {/* Status pill */}
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    record.status === 'verified' ? Colors.success : record.status === 'failed' ? Colors.danger : Colors.warning,
                },
              ]}
            >
              <Text style={styles.statusText}>
                {record.status === 'verified' ? 'Verified' : record.status === 'failed' ? 'Failed' : 'Pending'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Trust Score */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.scoreContainer}>
          <TrustScoreCircle score={record.trustScore} size={150} />
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.actionsRow}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: Colors.primary[500],
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Share Proof</Text>
          </Pressable>

          {record.blockchainTx && (
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

        {/* Cryptographic Proof */}
        <Section id="crypto" icon="finger-print" title="Cryptographic Proof" delay={400}>
          <DataRow
            label="File Hash (SHA-256)"
            value={record.fileHash}
            onCopy={() => copyText(record.fileHash, 'Hash')}
          />
          <DataRow
            label="Digital Signature"
            value={record.signature.substring(0, 40) + '...'}
            onCopy={() => copyText(record.signature, 'Signature')}
          />
          <DataRow
            label="Public Key"
            value={record.publicKey.substring(0, 40) + '...'}
            onCopy={() => copyText(record.publicKey, 'Public Key')}
          />
        </Section>

        {/* Blockchain Record */}
        <Section id="blockchain" icon="link" title="Blockchain Record" delay={500}>
          <DataRow
            label="Transaction Hash"
            value={record.blockchainTx ?? 'Pending'}
            onCopy={record.blockchainTx ? () => copyText(record.blockchainTx!, 'Tx Hash') : undefined}
          />
          <DataRow label="Block Number" value={record.blockNumber?.toString() ?? 'Pending'} />
          <DataRow label="Network" value={CHAIN_NAME} />
          <DataRow label="Timestamp" value={new Date(record.timestamp).toLocaleString()} />
        </Section>

        {/* AI Analysis */}
        <Section id="ai" icon="eye" title="AI Analysis" delay={600}>
          <ScoreBar
            label="Deepfake Detection"
            score={record.aiDeepfakeScore}
            color={record.aiDeepfakeScore > 0.3 ? Colors.danger : Colors.success}
          />
          <ScoreBar
            label="AI Generated"
            score={record.aiGeneratedScore}
            color={record.aiGeneratedScore > 0.3 ? Colors.danger : Colors.success}
          />
          <View style={[styles.verdictRow, { marginTop: 8 }]}>
            <Ionicons
              name={record.aiDeepfakeScore < 0.3 && record.aiGeneratedScore < 0.3 ? 'checkmark-circle' : 'warning'}
              size={18}
              color={record.aiDeepfakeScore < 0.3 && record.aiGeneratedScore < 0.3 ? Colors.success : Colors.danger}
            />
            <Text
              style={[
                styles.verdictText,
                {
                  color: record.aiDeepfakeScore < 0.3 && record.aiGeneratedScore < 0.3 ? Colors.success : Colors.danger,
                },
              ]}
            >
              {record.aiDeepfakeScore < 0.3 && record.aiGeneratedScore < 0.3
                ? 'Media appears genuine'
                : 'Potential manipulation detected'}
            </Text>
          </View>
        </Section>

        {/* Originality */}
        <Section id="originality" icon="search" title="Originality Check" delay={700}>
          <DataRow label="Plagiarism Score" value={`${record.plagiarismScore}%`} />
          <View style={styles.verdictRow}>
            <Ionicons
              name={record.plagiarismScore < 20 ? 'checkmark-circle' : 'warning'}
              size={18}
              color={record.plagiarismScore < 20 ? Colors.success : Colors.warning}
            />
            <Text
              style={[
                styles.verdictText,
                { color: record.plagiarismScore < 20 ? Colors.success : Colors.warning },
              ]}
            >
              {record.plagiarismScore < 20 ? 'Content appears original' : 'Similar content found'}
            </Text>
          </View>
        </Section>

        {/* Device Info */}
        <Section id="device" icon="phone-portrait" title="Device Info" delay={800}>
          <DataRow label="Platform" value={record.deviceInfo ?? 'Unknown'} />
          <DataRow label="Capture Time" value={new Date(record.createdAt).toLocaleString()} />
          <DataRow label="File Type" value={record.fileType.toUpperCase()} />
          <DataRow label="File Size" value={formatBytes(record.fileSize)} />
          {record.imageUrl && (
            <DataRow
              label="Public Image URL"
              value={record.imageUrl}
              onCopy={() => copyText(record.imageUrl!, 'Image URL')}
            />
          )}
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
              <LinearGradient
                colors={['#3B82F6', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.txModalIconBg}
              >
                <Ionicons name="cube" size={28} color="#FFFFFF" />
              </LinearGradient>
              <Text style={[styles.txModalTitle, { color: colors.text }]}>On-Chain Proof</Text>
              <Text style={[styles.txModalSubtitle, { color: colors.textSecondary }]}>
                Anchored on {CHAIN_NAME}
              </Text>
            </View>

            <ScrollView style={styles.txModalBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Transaction Hash</Text>
                <Pressable onPress={() => copyText(record.blockchainTx!, 'Tx Hash')} style={styles.txCopyRow}>
                  <Text style={[styles.txDetailValue, { color: colors.text }]} numberOfLines={2}>
                    {record.blockchainTx}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={Colors.primary[500]} />
                </Pressable>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Block Number</Text>
                <Text style={[styles.txDetailValue, { color: colors.text }]}>
                  {record.blockNumber?.toString() ?? 'Pending'}
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
                  <Ionicons name="copy-outline" size={16} color={Colors.primary[500]} />
                </Pressable>
              </View>

              <View style={[styles.txDetailRow, { borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>File Hash (Anchored)</Text>
                <Pressable onPress={() => copyText(record.fileHash, 'File Hash')} style={styles.txCopyRow}>
                  <Text style={[styles.txDetailValue, { color: colors.text }]} numberOfLines={1}>
                    {record.fileHash}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={Colors.primary[500]} />
                </Pressable>
              </View>

              <View style={[styles.txDetailRow, { borderColor: 'transparent' }]}>
                <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Timestamp</Text>
                <Text style={[styles.txDetailValue, { color: colors.text }]}>
                  {new Date(record.timestamp).toLocaleString()}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.txModalActions}>
              <Pressable
                onPress={() => {
                  const explorerUrl = `${BLOCK_EXPLORER}/tx/${record.blockchainTx}`;
                  Linking.openURL(explorerUrl).catch(() => {
                    Alert.alert('Explorer Error', 'Could not open the Sepolia block explorer. Please try again later.');
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
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                <Text style={[styles.txModalBtnText, { color: '#FFFFFF' }]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 20 },
  heroContainer: {
    width: width,
    height: width * 0.75,
    position: 'relative',
    backgroundColor: '#000',
  },
  heroImage: { width: '100%', height: '100%' },
  watermarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  watermarkGradient: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: 30,
  },
  watermarkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  watermarkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  watermarkScore: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  watermarkHash: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500', marginTop: 2, fontFamily: 'monospace' },
  statusPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  scoreContainer: { alignItems: 'center', paddingVertical: 24 },
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
    shadowColor: '#3B82F6',
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
  scoreBarContainer: { marginBottom: 10 },
  scoreBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreBarLabel: { fontSize: 12 },
  scoreBarValue: { fontSize: 12, fontWeight: '700' },
  scoreBarTrack: { height: 6, borderRadius: 3 },
  scoreBarFill: { height: 6, borderRadius: 3 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verdictText: { fontSize: 13, fontWeight: '600' },
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
  txDetailValue: { fontSize: 14, fontWeight: '500' },
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
