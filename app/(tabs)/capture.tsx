import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';
import { VerificationSteps } from '@/components/VerificationSteps';
import { TrustScoreCircle } from '@/components/TrustScoreCircle';

export default function CaptureScreen() {
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [showVerification, setShowVerification] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const router = useRouter();
  const { startVerification, currentVerification, clearVerification } = useAppStore();

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });

      if (photo?.uri) {
        setShowVerification(true);
        await startVerification(photo.uri, 'image');
      }
    } catch (error) {
      console.error('Capture failed:', error);
      Alert.alert('Capture Failed', 'Please try again.');
    }
  };

  const handleImport = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        // NOTE: Do NOT set quality here. Specifying quality causes JPEG
        // recompression, which produces different bytes on every pick
        // and breaks verify-by-image hash matching.
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileType = asset.type === 'video' ? 'video' : 'image';
        setShowVerification(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await startVerification(asset.uri, fileType as 'image' | 'video');
      }
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('Import Failed', 'Please try again.');
    }
  };

  const handleDismissVerification = () => {
    setShowVerification(false);
    const result = currentVerification?.result;
    clearVerification();
    if (result) {
      router.push(`/verify/${result.id}` as any);
    }
  };

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="camera-outline" size={64} color={colors.textSecondary} style={{ opacity: 0.5 }} />
        <Text style={[styles.permissionText, { color: colors.text }]}>Camera Access Required</Text>
        <Text style={[styles.permissionSubtext, { color: colors.textSecondary }]}>
          ProofSnap needs camera access to capture and verify media authenticity.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={[styles.permissionButton, { backgroundColor: Colors.primary[500] }]}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
        <Pressable onPress={handleImport} style={styles.importAltButton}>
          <Text style={[styles.importAltText, { color: Colors.primary[500] }]}>
            Or import from gallery
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      />

      {/* Top overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}
        pointerEvents="none"
      >
        <View style={styles.topRow}>
          <View style={styles.cameraModePill}>
            <View style={styles.liveDot} />
            <Ionicons name="camera" size={14} color="#FFFFFF" />
            <Text style={styles.cameraModeText}>ProofSnap Camera</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Corner guides */}
      <View style={styles.cornerGuides} pointerEvents="none">
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      {/* Bottom overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 84 }]}
      >
        {/* Import button */}
        <Pressable
          onPress={handleImport}
          style={({ pressed }) => [
            styles.sideButton,
            { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
          ]}
        >
          <View style={styles.sideButtonBg}>
            <Ionicons name="images" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.sideButtonText}>Import</Text>
        </Pressable>

        {/* Capture button */}
        <Pressable
          onPress={handleCapture}
          style={({ pressed }) => [
            styles.captureButton,
            { transform: [{ scale: pressed ? 0.88 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6']}
            style={styles.captureGradient}
          >
            <View style={styles.captureInner} />
          </LinearGradient>
        </Pressable>

        {/* Flip camera */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          style={({ pressed }) => [
            styles.sideButton,
            { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
          ]}
        >
          <View style={styles.sideButtonBg}>
            <Ionicons name="camera-reverse" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.sideButtonText}>Flip</Text>
        </Pressable>
      </LinearGradient>

      {/* Verification Modal */}
      <Modal
        visible={showVerification}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismissVerification}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.border }]} />

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Header icon */}
            <Animated.View entering={FadeIn.duration(400)} style={styles.modalHeaderIcon}>
              <LinearGradient
                colors={currentVerification?.isRunning ? ['#3B82F6', '#8B5CF6'] : ['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalIconCircle}
              >
                <Ionicons
                  name={currentVerification?.isRunning ? 'shield-half' : 'shield-checkmark'}
                  size={32}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </Animated.View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {currentVerification?.isRunning ? 'Verifying Media...' : 'Verification Complete'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {currentVerification?.isRunning
                ? 'Please wait while we authenticate your media'
                : 'Your media has been cryptographically verified'}
            </Text>

            {currentVerification?.steps && currentVerification.steps.length > 0 && (
              <View style={styles.stepsWrapper}>
                <VerificationSteps steps={currentVerification.steps} />
              </View>
            )}

            {!currentVerification?.isRunning && currentVerification?.result && (
              <Animated.View entering={FadeInUp.springify()} style={styles.resultContainer}>
                {/* Trust score */}
                <View style={[styles.resultCard, { backgroundColor: isDark ? Colors.dark.card : Colors.light.card, borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                  <TrustScoreCircle score={currentVerification.result.trustScore} />
                  <Text style={[styles.resultText, { color: colors.text }]}>
                    Media Verified Successfully
                  </Text>
                </View>

                {/* Result details */}
                <View style={[styles.resultDetailsCard, { backgroundColor: isDark ? Colors.dark.card : Colors.light.card, borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
                  {currentVerification.result.blockchainTx && (
                    <View style={styles.resultDetailRow}>
                      <View style={[styles.resultDetailIcon, { backgroundColor: '#8B5CF620' }]}>
                        <Ionicons name="link" size={16} color="#8B5CF6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>Blockchain Tx</Text>
                        <Text style={[styles.resultDetailValue, { color: colors.text }]} numberOfLines={1}>
                          {currentVerification.result.blockchainTx.substring(0, 24)}...
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.resultDetailRow}>
                    <View style={[styles.resultDetailIcon, { backgroundColor: '#3B82F620' }]}>
                      <Ionicons name="finger-print" size={16} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>File Hash (SHA-256)</Text>
                      <Text style={[styles.resultDetailValue, { color: colors.text }]} numberOfLines={1}>
                        {currentVerification.result.fileHash.substring(0, 24)}...
                      </Text>
                    </View>
                  </View>
                  <View style={styles.resultDetailRow}>
                    <View style={[styles.resultDetailIcon, { backgroundColor: '#10B98120' }]}>
                      <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>Trust Grade</Text>
                      <Text style={[styles.resultDetailValue, { color: colors.text }]}>
                        Grade {currentVerification.result.trustGrade} — Score {currentVerification.result.trustScore}/100
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={handleDismissVerification}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.viewDetailsButton}
                  >
                    <Text style={styles.viewDetailsText}>View Full Details</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            {currentVerification?.isRunning && (
              <View style={styles.runningIndicator}>
                <ActivityIndicator size="small" color={Colors.primary[500]} />
                <Text style={[styles.runningText, { color: colors.textSecondary }]}>
                  Processing...
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  camera: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  cameraModeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  cornerGuides: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '28%',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 30,
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    padding: 3,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  captureGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  sideButton: {
    alignItems: 'center',
    gap: 6,
  },
  sideButtonBg: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sideButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  permissionText: { fontSize: 22, fontWeight: '800', marginTop: 20 },
  permissionSubtext: { fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 22, opacity: 0.8 },
  permissionButton: {
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 28,
  },
  permissionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  importAltButton: { marginTop: 18 },
  importAltText: { fontSize: 14, fontWeight: '700' },
  // Modal
  modalContainer: { flex: 1, paddingTop: 14 },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalContent: { padding: 24, paddingBottom: 52 },
  modalHeaderIcon: { alignItems: 'center', marginBottom: 18 },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  modalSubtitle: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 6, marginBottom: 24, lineHeight: 19, opacity: 0.7 },
  stepsWrapper: { marginBottom: 8 },
  resultContainer: { alignItems: 'center', marginTop: 12, gap: 16 },
  resultCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
  },
  resultText: { fontSize: 18, fontWeight: '800', marginTop: 4, letterSpacing: -0.3 },
  resultDetailsCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 2,
  },
  resultDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  resultDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultDetailLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  resultDetailValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  txText: { fontSize: 12, marginTop: 4, opacity: 0.7 },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    width: '100%',
  },
  viewDetailsText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  runningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
  },
  runningText: { fontSize: 14, fontWeight: '500' },
});
