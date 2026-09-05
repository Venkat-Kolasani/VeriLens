import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppStore } from '@/stores/media-store';
import { VerificationSteps } from '@/components/VerificationSteps';
import { VerdictAxes, VerdictReasons } from '@/components/Verdict';

// Two images make a KYC case: the ID document, then a live selfie.
//
// The ID document may be imported from the gallery (people photograph their
// passport once). The SELFIE MAY NOT: an importable selfie is the whole
// injection attack this app exists to catch, so that step is camera-only and
// there is deliberately no picker fallback anywhere in this screen.
type Stage = 'id' | 'selfie';

export default function CaptureScreen() {
  const [stage, setStage] = useState<Stage>('id');
  const [idImageUri, setIdImageUri] = useState<string | null>(null);
  const [idImported, setIdImported] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showCheck, setShowCheck] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useThemeColors();
  const router = useRouter();
  const { startKycCheck, currentCheck, clearCheck } = useAppStore();

  const runCheck = async (idUri: string, selfieUri: string, idAttested: boolean) => {
    setShowCheck(true);
    try {
      // idAttested = the ID document came straight off this device's camera.
      // The selfie is always camera-captured; the pipeline separately
      // attempts real Lane D capture attestation (nonce + device signature)
      // for it before calling the forensics service.
      await startKycCheck(idUri, selfieUri, idAttested);
    } catch (err: any) {
      Alert.alert('Check Failed', err?.message ?? 'Please try again.');
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;

      if (stage === 'id') {
        setIdImageUri(photo.uri);
        setIdImported(false);
        setStage('selfie');
        return;
      }

      if (!idImageUri) return;
      await runCheck(idImageUri, photo.uri, !idImported);
    } catch (error) {
      console.error('Capture failed:', error);
      Alert.alert('Capture Failed', 'Please try again.');
    }
  };

  // Gallery import — ID document only.
  const handleImportId = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // NOTE: Do NOT set quality here. Specifying quality causes JPEG
        // recompression, which produces different bytes on every pick
        // and breaks verify-by-image hash matching.
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIdImageUri(result.assets[0].uri);
        setIdImported(true);
        setStage('selfie');
      }
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('Import Failed', 'Please try again.');
    }
  };

  const handleDismissCheck = () => {
    setShowCheck(false);
    const result = currentCheck?.result;
    clearCheck();
    setIdImageUri(null);
    setIdImported(false);
    setStage('id');
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
          A KYC case needs a live selfie taken on this device. The selfie cannot be
          imported from the gallery, so camera access is required.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={[styles.permissionButton, { backgroundColor: Colors.primary[500] }]}
        >
          <Text style={[styles.permissionButtonText, { color: '#0A0A0A' }]}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  const isSelfieStage = stage === 'selfie';
  const result = currentCheck?.result;
  const failed = result?.status === 'failed';

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={isSelfieStage ? 'front' : 'back'}
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
            <Ionicons name={isSelfieStage ? 'person' : 'card'} size={14} color="#FFFFFF" />
            <Text style={styles.cameraModeText}>
              {isSelfieStage ? 'Step 2 · Live selfie' : 'Step 1 · ID document'}
            </Text>
          </View>
        </View>
        <Text style={styles.hintText}>
          {isSelfieStage
            ? 'Look straight at the front camera. Camera only — no gallery.'
            : 'Fit the whole document inside the guides.'}
        </Text>
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
        {/* ID stage: import allowed. Selfie stage: captured ID thumbnail. */}
        {isSelfieStage ? (
          <View style={styles.sideButton}>
            {idImageUri && (
              <Image source={{ uri: idImageUri }} style={styles.idThumb} resizeMode="cover" />
            )}
            <Text style={styles.sideButtonText}>ID ✓</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleImportId}
            style={({ pressed }) => [
              styles.sideButton,
              { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
            ]}
          >
            <View style={styles.sideButtonBg}>
              <Ionicons name="images" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.sideButtonText}>Import ID</Text>
          </Pressable>
        )}

        {/* Capture button */}
        <Pressable
          onPress={handleCapture}
          style={({ pressed }) => [
            styles.captureButton,
            { transform: [{ scale: pressed ? 0.88 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={isSelfieStage ? ['#10B981', '#059669'] : ['#F5C400', '#CCA200']}
            style={styles.captureGradient}
          >
            <View style={styles.captureInner} />
          </LinearGradient>
        </Pressable>

        {/* Restart the case */}
        {isSelfieStage ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIdImageUri(null);
              setIdImported(false);
              setStage('id');
            }}
            style={({ pressed }) => [
              styles.sideButton,
              { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
            ]}
          >
            <View style={styles.sideButtonBg}>
              <Ionicons name="refresh" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.sideButtonText}>Retake ID</Text>
          </Pressable>
        ) : (
          <View style={styles.sideButton}>
            <View style={[styles.sideButtonBg, { opacity: 0.25 }]}>
              <Ionicons name="person" size={24} color="#FFFFFF" />
            </View>
            <Text style={[styles.sideButtonText, { opacity: 0.5 }]}>Selfie next</Text>
          </View>
        )}
      </LinearGradient>

      {/* Verification Modal */}
      <Modal
        visible={showCheck}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismissCheck}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: isDark ? Colors.dark.elevated : Colors.light.border }]} />

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.modalHeaderIcon}>
              <LinearGradient
                colors={
                  currentCheck?.isRunning
                    ? ['#F5C400', '#CCA200']
                    : failed
                    ? ['#EF4444', '#B91C1C']
                    : ['#10B981', '#059669']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalIconCircle}
              >
                <Ionicons
                  name={
                    currentCheck?.isRunning
                      ? 'shield-half'
                      : failed
                      ? 'alert-circle'
                      : 'shield-checkmark'
                  }
                  size={32}
                  color={currentCheck?.isRunning ? '#0A0A0A' : '#FFFFFF'}
                />
              </LinearGradient>
            </Animated.View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {currentCheck?.isRunning
                ? 'Running KYC check…'
                : failed
                ? 'No verdict produced'
                : 'Check complete'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {currentCheck?.isRunning
                ? 'Hashing, signing and analysing the ID document and selfie'
                : failed
                ? 'The forensics service could not be reached, so this case has no verdict. Nothing was guessed.'
                : 'Three independent axes, each with its own evidence'}
            </Text>

            {currentCheck?.steps && currentCheck.steps.length > 0 && (
              <View style={styles.stepsWrapper}>
                <VerificationSteps steps={currentCheck.steps} />
              </View>
            )}

            {!currentCheck?.isRunning && result && (
              <Animated.View entering={FadeInUp.springify()} style={styles.resultContainer}>
                <View
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
                      borderColor: isDark ? Colors.dark.border : Colors.light.border,
                    },
                  ]}
                >
                  <VerdictAxes
                    authenticity={result.authenticity}
                    identity={result.identity}
                    decision={result.decision}
                    confidence={result.confidence}
                    isCalibrated={result.confidenceIsCalibrated}
                  />
                </View>

                <View
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
                      borderColor: isDark ? Colors.dark.border : Colors.light.border,
                    },
                  ]}
                >
                  <Text style={[styles.resultSectionTitle, { color: colors.text }]}>
                    Why
                  </Text>
                  <VerdictReasons reasons={result.reasons} lanes={result.lanes} />
                </View>

                <View
                  style={[
                    styles.resultDetailsCard,
                    {
                      backgroundColor: isDark ? Colors.dark.card : Colors.light.card,
                      borderColor: isDark ? Colors.dark.border : Colors.light.border,
                    },
                  ]}
                >
                  {result.anchorTx && (
                    <View style={styles.resultDetailRow}>
                      <View style={[styles.resultDetailIcon, { backgroundColor: '#F5C40020' }]}>
                        <Ionicons name="link" size={16} color="#F5C400" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>
                          Verdict anchored (Sepolia)
                        </Text>
                        <Text style={[styles.resultDetailValue, { color: colors.text }]} numberOfLines={1}>
                          {result.anchorTx.substring(0, 24)}...
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.resultDetailRow}>
                    <View style={[styles.resultDetailIcon, { backgroundColor: '#8A8A8A20' }]}>
                      <Ionicons name="card" size={16} color="#8A8A8A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>
                        ID document (SHA-256)
                      </Text>
                      <Text style={[styles.resultDetailValue, { color: colors.text }]} numberOfLines={1}>
                        {result.idImageSha256 ? `${result.idImageSha256.substring(0, 24)}...` : '—'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.resultDetailRow}>
                    <View style={[styles.resultDetailIcon, { backgroundColor: '#10B98120' }]}>
                      <Ionicons name="person" size={16} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultDetailLabel, { color: colors.textSecondary }]}>
                        Selfie (SHA-256)
                      </Text>
                      <Text style={[styles.resultDetailValue, { color: colors.text }]} numberOfLines={1}>
                        {result.selfieSha256 ? `${result.selfieSha256.substring(0, 24)}...` : '—'}
                      </Text>
                    </View>
                  </View>
                </View>

                {failed && (
                  <Pressable
                    onPress={() => runCheck(result.idImageUri, result.selfieUri, result.idImageAttested)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <LinearGradient
                      colors={['#F5C400', '#CCA200']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.viewDetailsButton}
                    >
                      <Ionicons name="refresh" size={18} color="#0A0A0A" />
                      <Text style={[styles.viewDetailsText, { color: '#0A0A0A' }]}>Retry</Text>
                    </LinearGradient>
                  </Pressable>
                )}

                <Pressable
                  onPress={handleDismissCheck}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                >
                  <LinearGradient
                    colors={['#242424', '#0A0A0A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.viewDetailsButton}
                  >
                    <Text style={styles.viewDetailsText}>{failed ? 'Dismiss' : 'View Full Case'}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            {currentCheck?.isRunning && (
              <View style={styles.runningIndicator}>
                <ActivityIndicator size="small" color={colors.tint} />
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
  hintText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
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
  idThumb: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(16,185,129,0.9)',
    backgroundColor: '#000',
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
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
  },
  resultSectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
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
  resultDetailValue: { fontSize: 13, fontWeight: '600', marginTop: 2, fontFamily: Fonts?.mono },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 8,
    shadowColor: '#F5C400',
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
