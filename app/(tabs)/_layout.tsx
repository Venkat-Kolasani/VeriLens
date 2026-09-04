import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 92 : 72,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 8,
          elevation: 24,
          shadowColor: isDark ? '#000' : '#64748B',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: isDark ? 0.4 : 0.1,
          shadowRadius: 16,
        },
        tabBarActiveTintColor: Colors.primary[500],
        tabBarInactiveTintColor: isDark ? '#475569' : '#94A3B8',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarButton: (props) => (
          <Pressable
            {...props}
            onPress={(e) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              props.onPress?.(e);
            }}
            android_ripple={{ color: Colors.primary[500] + '15', borderless: true }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name={focused ? 'grid' : 'grid-outline'}
                size={21}
                color={color}
              />
              {focused && (
                <View style={[styles.activeIndicator, { backgroundColor: Colors.primary[500] }]} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name={focused ? 'images' : 'images-outline'}
                size={21}
                color={color}
              />
              {focused && (
                <View style={[styles.activeIndicator, { backgroundColor: Colors.primary[500] }]} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.captureWrapper}>
              <View style={[styles.captureOuterRing, focused && styles.captureOuterRingActive]}>
                <LinearGradient
                  colors={focused ? ['#3B82F6', '#6366F1', '#8B5CF6'] : (isDark ? ['#1E293B', '#334155'] : ['#E2E8F0', '#CBD5E1'])}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.captureIconContainer}
                >
                  <Ionicons
                    name="camera"
                    size={26}
                    color={focused ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')}
                  />
                </LinearGradient>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name={focused ? 'scan-circle' : 'scan-circle-outline'}
                size={21}
                color={color}
              />
              {focused && (
                <View style={[styles.activeIndicator, { backgroundColor: Colors.primary[500] }]} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name={focused ? 'person' : 'person-outline'}
                size={21}
                color={color}
              />
              {focused && (
                <View style={[styles.activeIndicator, { backgroundColor: Colors.primary[500] }]} />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    height: 32,
  },
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
  },
  captureWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  captureOuterRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  captureOuterRingActive: {
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  captureIconContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
});
