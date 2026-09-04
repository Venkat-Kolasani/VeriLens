import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  scanGalleryForNewImages,
  reverifyImage,
  getAllScannedImages,
  getScannerStats,
  type ScannedImage,
  type ScanProgress,
} from '@/lib/gallery-scanner';

const { width } = Dimensions.get('window');

type FilterType = 'all' | 'tampered' | 'safe' | 'WhatsApp' | 'Snapchat' | 'Camera';

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const [images, setImages] = useState<ScannedImage[]>([]);
  const [stats, setStats] = useState({ totalScanned: 0, tampered: 0, safe: 0, bySource: {} as Record<string, number> });
  const [filter, setFilter] = useState<FilterType>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [imgs, st] = await Promise.all([getAllScannedImages(), getScannerStats()]);
      setImages(imgs);
      setStats(st);
    } catch (err) {
      console.warn('Failed to load scanner data:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Non-blocking: load data asynchronously so UI doesn't freeze
      loadData();
    }, [])
  );

  const filtered = (() => {
    switch (filter) {
      case 'tampered':
        return images.filter((i) => i.isTampered);
      case 'safe':
        return images.filter((i) => !i.isTampered);
      case 'WhatsApp':
      case 'Snapchat':
      case 'Camera':
        return images.filter((i) => i.source === filter);
      default:
        return images;
    }
  })();

  const startScan = async () => {
    setIsScanning(true);
    setScanProgress(null);
    try {
      const result = await scanGalleryForNewImages((progress) => {
        setScanProgress(progress);
      }, 200);

      await loadData();

      Alert.alert(
        'Scan Complete',
        `New images hashed: ${result.newlyScanned}\nTampered detected: ${result.tamperedFound}\nTotal in database: ${result.totalScanned}`,
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message || 'Unknown error');
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const handleReverify = async (assetId: string) => {
    try {
      const result = await reverifyImage(assetId);
      if (!result) {
        Alert.alert('Error', 'Could not re-verify this image.');
        return;
      }
      await loadData();
      if (result.isTampered) {
        Alert.alert(
          'Tampered Detected!',
          `This image has been modified.\n\nOriginal hash:\n${result.originalHash.substring(0, 20)}...\n\nCurrent hash:\n${result.currentHash.substring(0, 20)}...`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Verified', 'This image has NOT been tampered with. Hash matches the original.');
      }
    } catch {
      Alert.alert('Error', 'Re-verification failed.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filters: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'apps' },
    { key: 'tampered', label: 'Tampered', icon: 'warning' },
    { key: 'safe', label: 'Safe', icon: 'shield-checkmark' },
    { key: 'WhatsApp', label: 'WhatsApp', icon: 'chatbubble' },
    { key: 'Snapchat', label: 'Snap', icon: 'eye' },
    { key: 'Camera', label: 'Camera', icon: 'camera' },
  ];

  const renderItem = ({ item, index }: { item: ScannedImage; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <Pressable
        onPress={() => handleReverify(item.assetId)}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
            borderColor: item.isTampered
              ? Colors.danger
              : isDark
              ? Colors.dark.border
              : Colors.light.border,
            borderWidth: item.isTampered ? 2 : 1,
          },
        ]}
      >
        {/* Thumbnail */}
        <Image
          source={{ uri: item.uri }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={200}
        />

        {/* Info */}
        <View style={styles.cardInfo}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardFileName, { color: colors.text }]} numberOfLines={1}>
              {item.fileName}
            </Text>
            {item.isTampered ? (
              <View style={[styles.badge, { backgroundColor: Colors.danger + '20' }]}>
                <Ionicons name="warning" size={12} color={Colors.danger} />
                <Text style={[styles.badgeText, { color: Colors.danger }]}>TAMPERED</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: Colors.success + '20' }]}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.success} />
                <Text style={[styles.badgeText, { color: Colors.success }]}>SAFE</Text>
              </View>
            )}
          </View>

          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="folder-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.source}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="finger-print-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {item.originalHash.substring(0, 10)}...
              </Text>
            </View>
          </View>

          {item.isTampered && (
            <View style={[styles.tamperDetail, { backgroundColor: Colors.danger + '10' }]}>
              <Text style={[styles.tamperText, { color: Colors.danger }]}>
                Hash mismatch detected — image was modified after first scan
              </Text>
            </View>
          )}

          <Text style={[styles.timeText, { color: colors.textSecondary }]}>
            Scanned: {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Scanner</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Auto-scan gallery for tampering
            </Text>
          </View>
          <Pressable
            onPress={startScan}
            disabled={isScanning}
            style={[
              styles.scanButton,
              {
                backgroundColor: isScanning ? colors.textSecondary : Colors.primary[500],
              },
            ]}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="scan" size={18} color="#FFF" />
                <Text style={styles.scanButtonText}>Scan Now</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Stats row */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}>
            <Ionicons name="images" size={20} color={Colors.primary[500]} />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalScanned}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Scanned</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
            <Text style={[styles.statValue, { color: Colors.success }]}>{stats.safe}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Safe</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}>
            <Ionicons name="warning" size={20} color={Colors.danger} />
            <Text style={[styles.statValue, { color: Colors.danger }]}>{stats.tampered}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tampered</Text>
          </View>
        </Animated.View>
      </View>

      {/* Scan progress */}
      {isScanning && scanProgress && (
        <View style={[styles.progressBar, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.elevated }]}>
          <View style={styles.progressHeader}>
            <ActivityIndicator size="small" color={Colors.primary[500]} />
            <Text style={[styles.progressText, { color: colors.text }]}>{scanProgress.message}</Text>
          </View>
          {scanProgress.total > 0 && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`,
                    backgroundColor: Colors.primary[500],
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === f.key
                    ? Colors.primary[500]
                    : isDark
                    ? Colors.dark.card
                    : Colors.light.card,
                borderColor:
                  filter === f.key
                    ? Colors.primary[500]
                    : isDark
                    ? Colors.dark.border
                    : Colors.light.border,
              },
            ]}
          >
            <Ionicons
              name={f.icon as any}
              size={13}
              color={filter === f.key ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.filterText,
                { color: filter === f.key ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Results list */}
      {filtered.length === 0 && !isScanning ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="scan-outline" size={64} color={colors.textSecondary} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            {stats.totalScanned === 0 ? 'No images scanned yet' : `No ${filter} images found`}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {stats.totalScanned === 0
              ? 'Tap "Scan Now" to hash images from your gallery\n(WhatsApp, Snapchat, Camera, etc.)'
              : 'Try a different filter or scan again'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
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
  header: { paddingHorizontal: 20, marginBottom: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, marginTop: 3, opacity: 0.7 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scanButtonText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: -0.2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Progress
  progressBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: { fontSize: 13, fontWeight: '600' },
  progressTrack: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterText: { fontSize: 11, fontWeight: '700' },

  // Card
  card: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 84,
    height: 104,
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    gap: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardFileName: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -0.2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: { fontSize: 11, opacity: 0.8 },
  tamperDetail: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 3,
  },
  tamperText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeText: { fontSize: 10, marginTop: 3, opacity: 0.6 },

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
