import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';
import { MediaCard } from '@/components/MediaCard';
import type { MediaRecord } from '@/lib/types';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;

type FilterType = 'all' | 'verified' | 'pending' | 'failed';

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const { records, loadRecords } = useAppStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecords();
    setRefreshing(false);
  };

  const filtered = filter === 'all'
    ? records
    : records.filter((r) => r.status === filter);

  const filters: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'apps' },
    { key: 'verified', label: 'Verified', icon: 'checkmark-circle' },
    { key: 'pending', label: 'Pending', icon: 'time' },
    { key: 'failed', label: 'Failed', icon: 'close-circle' },
  ];

  const renderItem = ({ item, index }: { item: MediaRecord; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(index * 60).springify()}
      style={{ width: CARD_WIDTH }}
    >
      <MediaCard record={item} />
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Gallery</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {filtered.length} {filter === 'all' ? 'total' : filter} items
            </Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)' }]}>
            <Ionicons name="images" size={16} color={Colors.primary[500]} />
            <Text style={[styles.countText, { color: Colors.primary[500] }]}>{records.length}</Text>
          </View>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {filters.map((f) => {
          const isActive = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive
                    ? Colors.primary[500]
                    : isDark
                    ? Colors.dark.card
                    : Colors.light.card,
                  borderColor: isActive
                    ? Colors.primary[500]
                    : isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
            >
              <Ionicons
                name={f.icon as any}
                size={14}
                color={isActive ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterText,
                  {
                    color: isActive ? '#FFFFFF' : colors.textSecondary,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Grid */}
      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)' }]}>
            <Ionicons name="images-outline" size={40} color={Colors.primary[400]} />
          </View>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {filter === 'all' ? 'No verified media yet' : `No ${filter} items`}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Capture or import media to see it here
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.gridContent}
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
  header: { paddingHorizontal: 20, marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, marginTop: 4, fontWeight: '500', opacity: 0.7 },
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 18,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  gridContent: { paddingBottom: 100 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySubtext: { fontSize: 13, marginTop: 6, opacity: 0.7 },
});
