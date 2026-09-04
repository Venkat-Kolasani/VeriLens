import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GRADES, getGrade } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';

interface TrustBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function TrustBadge({ score, size = 'md' }: TrustBadgeProps) {
  const grade = getGrade(score);
  const gradeInfo = GRADES[grade];
  const { isDark } = useThemeColors();

  const sizes = {
    sm: { container: 28, fontSize: 12, score: 9 },
    md: { container: 40, fontSize: 16, score: 11 },
    lg: { container: 64, fontSize: 28, score: 14 },
  };

  const s = sizes[size];

  return (
    <View
      style={[
        styles.badge,
        {
          width: s.container,
          height: s.container,
          borderRadius: s.container / 2,
          backgroundColor: isDark ? gradeInfo.darkBg : gradeInfo.bg,
          borderColor: gradeInfo.color,
        },
      ]}
    >
      <Text style={[styles.gradeText, { fontSize: s.fontSize, color: gradeInfo.color }]}>
        {gradeInfo.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  gradeText: {
    fontWeight: '800',
  },
});
