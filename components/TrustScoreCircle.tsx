import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { GRADES, getGrade } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TrustScoreCircleProps {
  score: number;
  size?: number;
}

export function TrustScoreCircle({ score, size = 160 }: TrustScoreCircleProps) {
  const { isDark, colors } = useThemeColors();
  const grade = getGrade(score);
  const gradeInfo = GRADES[grade];

  const animatedScore = useSharedValue(0);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animatedScore.value = withTiming(score, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [score]);

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1, { duration: 500 }),
  }));

  const progress = (score / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDark ? '#334155' : '#E2E8F0'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={gradeInfo.color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.inner}>
        <Animated.Text
          style={[
            styles.score,
            { color: gradeInfo.color },
            animatedTextStyle,
          ]}
        >
          {score}
        </Animated.Text>
        <Text style={[styles.gradeLabel, { color: colors.textSecondary }]}>
          Grade {gradeInfo.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  inner: {
    alignItems: 'center',
  },
  score: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
  },
  gradeLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
