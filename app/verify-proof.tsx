import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';

import { Colors } from '@/constants/Colors';
import { BLOCK_EXPLORER, CHAIN_FAUCET } from '@/constants/config';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  fetchTransactionFromExplorer,
  type ExplorerTxResult,
} from '@/lib/blockchain';
import { verifyCaseByImageHash, verifyCaseByTxHash, type SupabaseCase } from '@/lib/supabase';
import { hashMediaFile } from '@/lib/crypto';
import { formatConfidence, verdictColor } from '@/components/Verdict';
import type { Authenticity, Decision, Identity } from '@/lib/types';

const { width } = Dimensions.get('window');

type SearchMode = 'tx' | 'hash' | 'image';

interface VerificationResult {
  // Source data
  mode: SearchMode;
  searchQuery: string;
  // Blockchain
  explorerResult?: ExplorerTxResult;
  // Supabase
  cloudCase?: SupabaseCase | null;
  // Image hash (if mode=image)
  computedHash?: string;
  // Overall
  hashMatch?: boolean;
  proofFound: boolean;
}

export default function VerifyProofScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark, colors } = useThemeColors();

  const [mode, setMode] = useState<SearchMode>('tx');
  const [txHashInput, setTxHashInput] = useState('');
  const [fileHashInput, setFileHashInput] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // ── Pick image from gallery ──
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // NOTE: Do NOT set quality here. Must match import flow
      // (no recompression) so the same gallery image produces
      // the same hash in both import and verify.
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
    }
  };

  // ── Take photo ──
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
    }
  };

  // ── Paste from clipboard ──
  const pasteFromClipboard = async (target: 'tx' | 'hash') => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        if (target === 'tx') setTxHashInput(text.trim());
        else setFileHashInput(text.trim());
      }
    } catch {
      Alert.alert('Error', 'Failed to read clipboard.');
    }
  };

  // ══════════════════════════════════════════════
  //  Main verification logic
  // ══════════════════════════════════════════════

  const verify = async () => {
    setIsVerifying(true);
    setResult(null);

    try {
      if (mode === 'tx') {
        // ── Verify by Transaction Hash ──
        const txHash = txHashInput.trim();
        if (!txHash || !txHash.startsWith('0x') || txHash.length < 10) {
          Alert.alert('Invalid Input', 'Please enter a valid transaction hash (0x...).');
          return;
        }

        // 1. Fetch from Blockscout explorer API
        const explorerResult = await fetchTransactionFromExplorer(txHash);

        // 2. Check Supabase for matching proof
        const cloudCase = await verifyCaseByTxHash(txHash);

        // 3. Cross-check: the anchored payload is the VERDICT digest, so a
        //    typed hash is compared against that, not against an image hash.
        let hashMatch: boolean | undefined;
        if (fileHashInput.trim() && explorerResult.decodedProof) {
          const inputHash = fileHashInput.trim().toLowerCase().replace(/^0x/, '');
          const chainHash = explorerResult.decodedProof.fileHash.toLowerCase().replace(/^0x/, '');
          hashMatch = inputHash === chainHash;
        }

        setResult({
          mode: 'tx',
          searchQuery: txHash,
          explorerResult,
          cloudCase,
          hashMatch,
          proofFound: explorerResult.found,
        });
      } else if (mode === 'hash') {
        // ── Verify by File Hash ──
        const hash = fileHashInput.trim().replace(/^0x/, '');
        if (!hash || hash.length < 16) {
          Alert.alert('Invalid Input', 'Please enter a valid SHA-256 image hash.');
          return;
        }

        // 1. Search Supabase for matching proof
        const cloudCase = await verifyCaseByImageHash(hash);

        // 2. If Supabase has a blockchain_tx, verify on explorer
        let explorerResult: ExplorerTxResult | undefined;
        if (cloudCase?.anchor_tx) {
          explorerResult = await fetchTransactionFromExplorer(cloudCase.anchor_tx);
        }

        setResult({
          mode: 'hash',
          searchQuery: hash,
          explorerResult,
          cloudCase,
          proofFound: !!cloudCase,
        });
      } else if (mode === 'image') {
        // ── Verify by Image ──
        if (!imageUri) {
          Alert.alert('No Image', 'Please select or capture an image first.');
          return;
        }

        // 1. Hash the image
        const computedHash = await hashMediaFile(imageUri);

        // 2. Search Supabase by the computed hash
        const cloudCase = await verifyCaseByImageHash(computedHash);

        // 3. If Supabase has a blockchain_tx, verify on explorer
        let explorerResult: ExplorerTxResult | undefined;
        if (cloudCase?.anchor_tx) {
          explorerResult = await fetchTransactionFromExplorer(cloudCase.anchor_tx);
        }

        // 4. Cross-check against the case's stored image hashes. (Comparing
        //    an image hash to the on-chain payload would always fail: what is
        //    anchored is the verdict digest, not the image.)
        let hashMatch: boolean | undefined;
        if (cloudCase) {
          const lower = computedHash.toLowerCase();
          hashMatch =
            cloudCase.id_image_sha256?.toLowerCase() === lower ||
            cloudCase.selfie_sha256?.toLowerCase() === lower;
        }

        setResult({
          mode: 'image',
          searchQuery: imageUri,
          computedHash,
          explorerResult,
          cloudCase,
          hashMatch,
          proofFound: !!cloudCase,
        });
      }
    } catch (err: any) {
      Alert.alert('Verification Error', err?.message ?? 'Something went wrong.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Copy helper ──
  const copy = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', `${label} copied to clipboard.`);
    } catch {}
  };

  // ══════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════

  const modes: { key: SearchMode; label: string; icon: string }[] = [
    { key: 'tx', label: 'By TX Hash', icon: 'link' },
    { key: 'hash', label: 'By Image Hash', icon: 'finger-print' },
    { key: 'image', label: 'By Image', icon: 'image' },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Verify Proof</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Check if a KYC verdict is anchored on Sepolia
              </Text>
            </View>
          </Animated.View>

          {/* Mode Tabs */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.modeRow}>
            {modes.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMode(m.key);
                  setResult(null);
                }}
                style={[
                  styles.modeTab,
                  {
                    backgroundColor:
                      mode === m.key
                        ? Colors.primary[500]
                        : isDark
                        ? Colors.dark.card
                        : Colors.light.card,
                    borderColor:
                      mode === m.key
                        ? Colors.primary[500]
                        : isDark
                        ? Colors.dark.border
                        : Colors.light.border,
                  },
                ]}
              >
                <Ionicons
                  name={m.icon as any}
                  size={14}
                  color={mode === m.key ? '#FFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.modeTabText,
                    { color: mode === m.key ? '#FFF' : colors.textSecondary },
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </Animated.View>

          {/* Input Section */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <View
              style={[
                styles.inputCard,
                {
                  backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
                  borderColor: isDark ? Colors.dark.border : Colors.light.border,
                },
              ]}
            >
              {/* TX Hash Input */}
              {(mode === 'tx') && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    TRANSACTION HASH
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          color: colors.text,
                          backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                          borderColor: isDark ? Colors.dark.border : Colors.light.border,
                        },
                      ]}
                      placeholder="0x..."
                      placeholderTextColor={colors.textSecondary}
                      value={txHashInput}
                      onChangeText={setTxHashInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => pasteFromClipboard('tx')}
                      style={[styles.pasteBtn, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
                    >
                      <Ionicons name="clipboard-outline" size={18} color={Colors.primary[500]} />
                    </Pressable>
                  </View>
                  <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                    Optionally enter the verdict digest below to cross-verify
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                        borderColor: isDark ? Colors.dark.border : Colors.light.border,
                        marginTop: 8,
                      },
                    ]}
                    placeholder="Verdict digest (optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={fileHashInput}
                    onChangeText={setFileHashInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              {/* File Hash Input */}
              {mode === 'hash' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    SHA-256 IMAGE HASH
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          color: colors.text,
                          backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                          borderColor: isDark ? Colors.dark.border : Colors.light.border,
                        },
                      ]}
                      placeholder="e.g. a1b2c3d4..."
                      placeholderTextColor={colors.textSecondary}
                      value={fileHashInput}
                      onChangeText={setFileHashInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => pasteFromClipboard('hash')}
                      style={[styles.pasteBtn, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
                    >
                      <Ionicons name="clipboard-outline" size={18} color={Colors.primary[500]} />
                    </Pressable>
                  </View>
                </>
              )}

              {/* Image Input */}
              {mode === 'image' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    SELECT AN IMAGE TO VERIFY
                  </Text>
                  <View style={styles.imageActions}>
                    <Pressable
                      onPress={pickImage}
                      style={[
                        styles.imagePickBtn,
                        {
                          backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                          borderColor: isDark ? Colors.dark.border : Colors.light.border,
                        },
                      ]}
                    >
                      <Ionicons name="images-outline" size={24} color={Colors.primary[500]} />
                      <Text style={[styles.imagePickText, { color: colors.text }]}>Gallery</Text>
                    </Pressable>
                    <Pressable
                      onPress={takePhoto}
                      style={[
                        styles.imagePickBtn,
                        {
                          backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated,
                          borderColor: isDark ? Colors.dark.border : Colors.light.border,
                        },
                      ]}
                    >
                      <Ionicons name="camera-outline" size={24} color={Colors.primary[500]} />
                      <Text style={[styles.imagePickText, { color: colors.text }]}>Camera</Text>
                    </Pressable>
                  </View>
                  {imageUri && (
                    <View style={styles.imagePreviewRow}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                      <Text style={[styles.imagePreviewText, { color: Colors.success }]} numberOfLines={1}>
                        Image selected
                      </Text>
                      <Pressable onPress={() => setImageUri(null)}>
                        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
          </Animated.View>

          {/* Verify Button */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Pressable
              onPress={verify}
              disabled={isVerifying}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <LinearGradient
                colors={isVerifying ? ['#64748B', '#64748B'] : ['#3B82F6', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.verifyBtn}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={20} color="#FFF" />
                    <Text style={styles.verifyBtnText}>Verify on Blockchain</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* ══════ Results ══════ */}
          {result && (
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              {/* Overall Status Banner */}
              <View
                style={[
                  styles.statusBanner,
                  {
                    backgroundColor: result.proofFound
                      ? Colors.success + '18'
                      : Colors.danger + '18',
                    borderColor: result.proofFound ? Colors.success : Colors.danger,
                  },
                ]}
              >
                <Ionicons
                  name={result.proofFound ? 'checkmark-circle' : 'close-circle'}
                  size={28}
                  color={result.proofFound ? Colors.success : Colors.danger}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.statusTitle,
                      { color: result.proofFound ? Colors.success : Colors.danger },
                    ]}
                  >
                    {result.proofFound ? 'Case Found' : 'Case Not Found'}
                  </Text>
                  <Text style={[styles.statusDesc, { color: colors.textSecondary }]}>
                    {result.proofFound
                      ? 'A KYC case matching this input exists on-chain / in the VeriLens cloud'
                      : 'No matching case found on-chain or in the VeriLens cloud'}
                  </Text>
                </View>
              </View>

              {/* Hash Match */}
              {result.hashMatch !== undefined && (
                <View
                  style={[
                    styles.matchBadge,
                    {
                      backgroundColor: result.hashMatch
                        ? Colors.success + '18'
                        : Colors.danger + '18',
                      borderColor: result.hashMatch ? Colors.success : Colors.danger,
                    },
                  ]}
                >
                  <Ionicons
                    name={result.hashMatch ? 'checkmark-circle' : 'warning'}
                    size={18}
                    color={result.hashMatch ? Colors.success : Colors.danger}
                  />
                  <Text
                    style={[
                      styles.matchText,
                      { color: result.hashMatch ? Colors.success : Colors.danger },
                    ]}
                  >
                    {result.hashMatch
                      ? 'Hash matches the anchored payload — this input is the one that was checked'
                      : 'Hash mismatch — this is not the payload that was anchored'}
                  </Text>
                </View>
              )}

              {/* Computed Hash (from image) */}
              {result.computedHash && (
                <ResultCard title="Computed Image Hash" icon="finger-print" isDark={isDark} colors={colors}>
                  <ResultRow
                    label="SHA-256"
                    value={result.computedHash}
                    copiable
                    onCopy={() => copy(result.computedHash!, 'Hash')}
                    colors={colors}
                    isDark={isDark}
                  />
                </ResultCard>
              )}

              {/* Blockchain Details */}
              {result.explorerResult?.found && (
                <ResultCard title="Blockchain Transaction" icon="cube" isDark={isDark} colors={colors}>
                  <ResultRow
                    label="TX Hash"
                    value={result.explorerResult.hash!}
                    copiable
                    onCopy={() => copy(result.explorerResult!.hash!, 'TX Hash')}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Block"
                    value={result.explorerResult.blockNumber?.toString() ?? 'Pending'}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="From"
                    value={result.explorerResult.from ?? 'Unknown'}
                    copiable
                    onCopy={() => copy(result.explorerResult!.from!, 'Address')}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="To"
                    value={result.explorerResult.to ?? 'Unknown'}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Status"
                    value={result.explorerResult.status === 'ok' ? '✅ Success' : result.explorerResult.status ?? 'Unknown'}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Timestamp"
                    value={
                      result.explorerResult.timestamp
                        ? new Date(result.explorerResult.timestamp).toLocaleString()
                        : 'Unknown'
                    }
                    colors={colors}
                    isDark={isDark}
                  />

                  {/* View on Explorer */}
                  <Pressable
                    onPress={() =>
                      Linking.openURL(`${BLOCK_EXPLORER}/tx/${result.explorerResult!.hash}`)
                    }
                    style={[styles.explorerLink, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
                  >
                    <Ionicons name="globe-outline" size={16} color={Colors.primary[500]} />
                    <Text style={[styles.explorerLinkText, { color: Colors.primary[500] }]}>
                      View on Sepolia Explorer
                    </Text>
                    <Ionicons name="open-outline" size={14} color={Colors.primary[500]} />
                  </Pressable>
                </ResultCard>
              )}

              {/* Decoded Proof Data */}
              {result.explorerResult?.decodedProof && (
                <ResultCard title="Decoded Proof Data" icon="lock-open" isDark={isDark} colors={colors}>
                  <ResultRow
                    label="Anchored Verdict Digest"
                    value={result.explorerResult.decodedProof.fileHash}
                    copiable
                    onCopy={() => copy(result.explorerResult!.decodedProof!.fileHash, 'File Hash')}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Signature"
                    value={result.explorerResult.decodedProof.signature.substring(0, 40) + '...'}
                    copiable
                    onCopy={() => copy(result.explorerResult!.decodedProof!.signature, 'Signature')}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Public Key"
                    value={result.explorerResult.decodedProof.publicKey.substring(0, 40) + '...'}
                    copiable
                    onCopy={() => copy(result.explorerResult!.decodedProof!.publicKey, 'Public Key')}
                    colors={colors}
                    isDark={isDark}
                  />
                </ResultCard>
              )}

              {/* Cloud case record */}
              {result.cloudCase && (
                <ResultCard title="VeriLens Cloud Case" icon="cloud-done" isDark={isDark} colors={colors}>
                  <View style={styles.axisRow}>
                    {([
                      ['Authenticity', result.cloudCase.authenticity as Authenticity | null],
                      ['Identity', result.cloudCase.identity as Identity | null],
                      ['Decision', result.cloudCase.decision as Decision | null],
                    ] as const).map(([label, value]) => (
                      <View key={label} style={styles.axisChip}>
                        <Text style={[styles.axisChipLabel, { color: colors.textSecondary }]}>
                          {label}
                        </Text>
                        <Text style={[styles.axisChipValue, { color: verdictColor(value) }]}>
                          {value ? value.replace(/_/g, ' ') : 'NOT ASSESSED'}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <ResultRow
                    label="Confidence"
                    value={formatConfidence(
                      result.cloudCase.confidence,
                      result.cloudCase.confidence_is_calibrated
                    )}
                    colors={colors}
                    isDark={isDark}
                  />
                  {(result.cloudCase.reasons ?? []).map((reason, i) => (
                    <ResultRow
                      key={`${reason.lane}-${i}`}
                      label={`Reason · ${reason.lane}`}
                      value={reason.text}
                      colors={colors}
                      isDark={isDark}
                    />
                  ))}
                  <ResultRow
                    label="Review Status"
                    value={result.cloudCase.review_status ?? 'Not sent to review'}
                    colors={colors}
                    isDark={isDark}
                  />
                  <ResultRow
                    label="Created"
                    value={new Date(result.cloudCase.created_at).toLocaleString()}
                    colors={colors}
                    isDark={isDark}
                  />
                  {result.cloudCase.id_image_url && (
                    <Pressable
                      onPress={() => Linking.openURL(result.cloudCase!.id_image_url!)}
                      style={[styles.explorerLink, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
                    >
                      <Ionicons name="image-outline" size={16} color={Colors.primary[500]} />
                      <Text style={[styles.explorerLinkText, { color: Colors.primary[500] }]}>
                        View ID Document
                      </Text>
                      <Ionicons name="open-outline" size={14} color={Colors.primary[500]} />
                    </Pressable>
                  )}
                  {result.cloudCase.selfie_url && (
                    <Pressable
                      onPress={() => Linking.openURL(result.cloudCase!.selfie_url!)}
                      style={[styles.explorerLink, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}
                    >
                      <Ionicons name="person-outline" size={16} color={Colors.primary[500]} />
                      <Text style={[styles.explorerLinkText, { color: Colors.primary[500] }]}>
                        View Selfie
                      </Text>
                      <Ionicons name="open-outline" size={14} color={Colors.primary[500]} />
                    </Pressable>
                  )}
                </ResultCard>
              )}
            </Animated.View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════
//  Reusable sub-components
// ══════════════════════════════════════════════

function ResultCard({
  title,
  icon,
  isDark,
  colors,
  children,
}: {
  title: string;
  icon: string;
  isDark: boolean;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.resultCard,
        {
          backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
        },
      ]}
    >
      <View style={styles.resultCardHeader}>
        <Ionicons name={icon as any} size={16} color={Colors.primary[500]} />
        <Text style={[styles.resultCardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ResultRow({
  label,
  value,
  copiable,
  onCopy,
  colors,
  isDark,
}: {
  label: string;
  value: string;
  copiable?: boolean;
  onCopy?: () => void;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.resultValueRow}>
        <Text style={[styles.resultValue, { color: colors.text }]} numberOfLines={1} selectable>
          {value}
        </Text>
        {copiable && onCopy && (
          <Pressable onPress={onCopy} style={styles.resultCopyBtn}>
            <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════
//  Styles
// ══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  // Verdict axes inside the cloud-case card
  axisRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  axisChip: { flex: 1, gap: 2 },
  axisChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  axisChipValue: { fontSize: 11, fontWeight: '900', letterSpacing: 0.2 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { padding: 6 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },

  // Mode tabs
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  modeTabText: { fontSize: 12, fontWeight: '700' },

  // Input card
  inputCard: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16 },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  inputRow: { flexDirection: 'row', gap: 8 },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pasteBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  inputHint: { fontSize: 11, marginTop: 10 },

  // Image picker
  imageActions: { flexDirection: 'row', gap: 12 },
  imagePickBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  imagePickText: { fontSize: 13, fontWeight: '700' },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  imagePreviewText: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Verify button
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  verifyBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },

  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  statusTitle: { fontSize: 17, fontWeight: '800' },
  statusDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  // Hash match badge
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  matchText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },

  // Result cards
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  resultCardTitle: { fontSize: 15, fontWeight: '800' },
  resultRow: { marginBottom: 10 },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  resultValueRow: { flexDirection: 'row', alignItems: 'center' },
  resultValue: { flex: 1, fontSize: 13, fontWeight: '500' },
  resultCopyBtn: { padding: 4, marginLeft: 6 },

  // Explorer link button
  explorerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  explorerLinkText: { fontSize: 13, fontWeight: '700' },
});
