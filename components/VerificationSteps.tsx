import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { VerificationStep } from '@/lib/types';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Colors } from '@/constants/Colors';

interface VerificationStepsProps {
  steps: VerificationStep[];
}

export function VerificationSteps({ steps }: VerificationStepsProps) {
  const { isDark, colors } = useThemeColors();

  return (
    <View style={styles.container}>
      {steps.map((step, index) => (
        <Animated.View
          key={step.id}
          entering={FadeInDown.delay(index * 80).springify()}
          style={[
            styles.step,
            {
              backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
              borderColor:
                step.status === 'success'
                  ? Colors.success + '40'
                  : step.status === 'error'
                  ? Colors.danger + '40'
                  : isDark
                  ? Colors.dark.border
                  : Colors.light.border,
            },
          ]}
        >
          <View
            style={[
              styles.stepIconContainer,
              {
                backgroundColor:
                  step.status === 'success'
                    ? Colors.success + '15'
                    : step.status === 'error'
                    ? Colors.danger + '15'
                    : step.status === 'running'
                    ? Colors.primary[500] + '15'
                    : 'transparent',
              },
            ]}
          >
            {step.status === 'waiting' && (
              <View style={[styles.waitingDot, { backgroundColor: colors.textSecondary }]} />
            )}
            {step.status === 'running' && (
              <ActivityIndicator size="small" color={Colors.primary[500]} />
            )}
            {step.status === 'success' && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            )}
            {step.status === 'error' && (
              <Ionicons name="close-circle" size={22} color={Colors.danger} />
            )}
          </View>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <View
              style={[
                styles.connector,
                {
                  backgroundColor:
                    step.status === 'success'
                      ? Colors.success
                      : isDark
                      ? Colors.dark.border
                      : Colors.light.border,
                },
              ]}
            />
          )}

          <View style={styles.stepContent}>
            <Text
              style={[
                styles.stepLabel,
                {
                  color:
                    step.status === 'waiting'
                      ? colors.textSecondary
                      : colors.text,
                  fontWeight: step.status === 'running' ? '600' : '400',
                },
              ]}
            >
              {step.label}
            </Text>
            {step.detail && (
              <Animated.Text
                entering={FadeIn.duration(300)}
                style={[styles.stepDetail, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {step.detail}
              </Animated.Text>
            )}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  stepIconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  connector: {
    position: 'absolute',
    left: 24,
    bottom: -6,
    width: 2,
    height: 8,
    borderRadius: 1,
  },
  waitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.4,
  },
  stepContent: {
    flex: 1,
    marginLeft: 12,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  stepDetail: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
});
