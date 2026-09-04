import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';

import { Colors } from '@/constants/Colors';
import {
  BLOCK_EXPLORER,
  CHAIN_CURRENCY,
  CHAIN_FAUCET,
  CHAIN_ID,
  CHAIN_NAME,
  WALLET_PRIVATE_KEY,
} from '@/constants/config';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const { publicKey, walletAddress, walletBalance, stats, refreshWallet, refreshStats } = useAppStore();

  // Whether the app is using the hardcoded deployer wallet
  const isConfiguredWallet = !!WALLET_PRIVATE_KEY && WALLET_PRIVATE_KEY.trim().length > 0;
  // Balance as a float to detect zero/low
  const balanceNum = parseFloat(walletBalance ?? '0') || 0;
  const hasLowBalance = balanceNum < 0.01;

  useFocusEffect(
    useCallback(() => {
      // Non-blocking: refresh data asynchronously
      refreshWallet();
      refreshStats();
    }, [])
  );

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied!', `${label} copied to clipboard.`);
    } catch {
      Alert.alert('Error', 'Failed to copy.');
    }
  };

  const openFaucet = () => {
    Linking.openURL(CHAIN_FAUCET).catch(() =>
      Alert.alert('Error', 'Could not open faucet URL.')
    );
  };

  const openExplorer = (address: string) => {
    Linking.openURL(`${BLOCK_EXPLORER}/address/${address}`).catch(() =>
      Alert.alert('Error', 'Could not open explorer URL.')
    );
  };

  const InfoRow = ({
    icon,
    label,
    value,
    copyable,
    onTap,
    accentColor,
    delay = 0,
  }: {
    icon: string;
    label: string;
    value: string;
    copyable?: boolean;
    onTap?: () => void;
    accentColor?: string;
    delay?: number;
  }) => (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Pressable
        onPress={onTap}
        disabled={!onTap && !copyable}
        style={[
          styles.infoRow,
          {
            backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
            borderColor: isDark ? Colors.dark.border : Colors.light.border,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: (accentColor ?? Colors.primary[500]) + '18' }]}>
          <Ionicons name={icon as any} size={18} color={accentColor ?? Colors.primary[500]} />
        </View>
        <View style={styles.infoContent}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
          <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
        {copyable && (
          <Pressable
            onPress={() => copyToClipboard(value, label)}
            style={({ pressed }) => [styles.copyButton, { opacity: pressed ? 0.5 : 1 }]}
            hitSlop={8}
          >
            <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
        {onTap && !copyable && (
          <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.headerSection}>
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Ionicons name="shield-checkmark" size={36} color="#FFFFFF" />
          </LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>VeriLens</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Media Authentication System
          </Text>
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.statsContainer, { backgroundColor: isDark ? Colors.dark.card : Colors.light.card, borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: Colors.primary[500] }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Cases</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: isDark ? Colors.dark.border : Colors.light.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: Colors.success }]}>{stats.accepted}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Accepted</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: isDark ? Colors.dark.border : Colors.light.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>{stats.onChain}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>On-Chain</Text>
          </View>
        </Animated.View>

        {/* Device Key Section */}
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Key</Text>
        </Animated.View>

        <InfoRow
          icon="key"
          label="Ed25519 Public Key"
          value={publicKey ?? 'Not generated'}
          copyable={!!publicKey}
          delay={300}
        />

        {/* Blockchain Section */}
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Blockchain Wallet</Text>
        </Animated.View>

        {/* Wallet type badge */}
        <Animated.View entering={FadeInDown.delay(370).springify()}>
          <View style={[styles.walletTypeBadge, {
            backgroundColor: isConfiguredWallet
              ? Colors.success + '15'
              : Colors.primary[500] + '15',
            borderColor: isConfiguredWallet
              ? Colors.success + '40'
              : Colors.primary[500] + '40',
          }]}>
            <Ionicons
              name={isConfiguredWallet ? 'shield-checkmark' : 'phone-portrait-outline'}
              size={14}
              color={isConfiguredWallet ? Colors.success : Colors.primary[500]}
            />
            <Text style={[styles.walletTypeBadgeText, {
              color: isConfiguredWallet ? Colors.success : Colors.primary[500],
            }]}>
              {isConfiguredWallet ? 'Configured deployer wallet' : 'Device-generated wallet'}
            </Text>
          </View>
        </Animated.View>

        <InfoRow
          icon="wallet"
          label="Wallet Address"
          value={walletAddress ?? 'Loading...'}
          copyable={!!walletAddress}
          onTap={walletAddress ? () => openExplorer(walletAddress) : undefined}
          delay={400}
        />

        {/* Balance row with low-balance warning */}
        <InfoRow
          icon="diamond"
          label={`Testnet Balance (${CHAIN_CURRENCY})`}
          value={`${parseFloat(walletBalance ?? '0').toFixed(4)} ${CHAIN_CURRENCY}`}
          accentColor={hasLowBalance ? Colors.danger : Colors.success}
          delay={450}
        />

        {/* Low balance warning + faucet CTA */}
        {hasLowBalance && (
          <Animated.View entering={FadeInDown.delay(470).springify()}>
            <Pressable
              onPress={openFaucet}
              style={({ pressed }) => [
                styles.faucetBanner,
                {
                  backgroundColor: isDark ? '#7C2D12' + 'AA' : '#FEF3C7',
                  borderColor: '#F59E0B40',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.faucetTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                  Insufficient {CHAIN_CURRENCY} for gas
                </Text>
                <Text style={[styles.faucetSubtext, { color: isDark ? '#FCD34D' + 'BB' : '#92400E' + 'BB' }]}>
                  Tap to get free tokens from the Sepolia faucet →
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        <InfoRow
          icon="globe"
          label="Network"
          value={`${CHAIN_NAME} (EVM)`}
          delay={500}
        />

        {/* About Section */}
        <Animated.View entering={FadeInDown.delay(550).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        </Animated.View>

        <InfoRow icon="information-circle" label="Version" value="1.0.0" delay={600} />
        <InfoRow icon="shield" label="Security" value="Ed25519 + SHA-256" delay={650} />
        <InfoRow icon="link" label="Blockchain" value={`Sepolia (EVM, Chain ${CHAIN_ID})`} delay={700} />
        <InfoRow icon="eye" label="Forensics" value="Self-hosted lane detectors" delay={750} />

        {/* How It Works */}
        <Animated.View entering={FadeInDown.delay(800).springify()}>
          <View style={[styles.howItWorks, { backgroundColor: isDark ? Colors.dark.card : Colors.light.card, borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
            <Text style={[styles.howTitle, { color: colors.text }]}>How VeriLens Works</Text>
            {[
              { step: '1', text: 'Photograph the ID document', icon: 'card' },
              { step: '2', text: 'Take a live selfie (camera only)', icon: 'person' },
              { step: '3', text: 'SHA-256 both images, sign the pair', icon: 'finger-print' },
              { step: '4', text: 'Run the forensic detector lanes', icon: 'eye' },
              { step: '5', text: 'Anchor the verdict hash on Sepolia', icon: 'link' },
              { step: '6', text: 'Accept, reject, or send to review', icon: 'clipboard' },
            ].map((item) => (
              <View key={item.step} style={styles.howStep}>
                <View style={[styles.howStepNumber, { backgroundColor: Colors.primary[500] + '20' }]}>
                  <Text style={[styles.howStepNumberText, { color: Colors.primary[500] }]}>{item.step}</Text>
                </View>
                <Text style={[styles.howStepText, { color: colors.text }]}>{item.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 10 },
  headerSection: { alignItems: 'center', marginBottom: 30 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, marginTop: 5, fontWeight: '500', opacity: 0.7 },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 28,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  statDivider: { width: 1, height: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 12, letterSpacing: -0.2 },
  walletTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  walletTypeBadgeText: { fontSize: 13, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 8,
    gap: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: '600', marginTop: 4, letterSpacing: -0.1 },
  copyButton: { padding: 10 },
  faucetBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  faucetTitle: { fontSize: 13, fontWeight: '700' },
  faucetSubtext: { fontSize: 12, fontWeight: '500', marginTop: 3 },
  howItWorks: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginTop: 12,
  },
  howTitle: { fontSize: 18, fontWeight: '900', marginBottom: 18, letterSpacing: -0.3 },
  howStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  howStepNumber: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howStepNumberText: { fontSize: 14, fontWeight: '900' },
  howStepText: { fontSize: 14, flex: 1, fontWeight: '500' },
});

