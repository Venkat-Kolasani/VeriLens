import { API_BASE_URL } from '@/constants/config';
import * as FileSystem from 'expo-file-system/legacy';
import type { AIDetectionResult, PlagiarismResult } from './types';

// Timeout wrapper for async operations  
const API_TIMEOUT = 30000; // 30 seconds

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// AI Deepfake detection - calls backend which proxies to SightEngine
export async function detectDeepfake(imageBase64: string): Promise<AIDetectionResult> {
  try {
    if (!imageBase64 || imageBase64.length === 0) {
      return simulateAIDetection();
    }

    // Create temporary file from base64 for multipart upload
    const tmpUri = FileSystem.cacheDirectory + `detect_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tmpUri, imageBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Upload as multipart form-data with timeout (matches server's multer expectation)
    const uploadResult = await withTimeout(
      FileSystem.uploadAsync(
        `${API_BASE_URL}/api/detect`,
        tmpUri,
        {
          fieldName: 'media',
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        }
      ),
      API_TIMEOUT,
      'AI detection'
    );

    // Clean up temp file
    try { await FileSystem.deleteAsync(tmpUri, { idempotent: true }); } catch { }

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      const data = JSON.parse(uploadResult.body);
      const isSimulated = data.simulated === true;
      // Server returns nested shape: { deepfake: { score }, aiGenerated: { score } }
      const deepfakeScore = data.deepfake?.score ?? data.deepfakeScore ?? 0;
      const aiGeneratedScore = data.aiGenerated?.score ?? data.aiGeneratedScore ?? 0;
      return {
        deepfakeScore: Math.round(deepfakeScore * 100) / 100,
        aiGeneratedScore: Math.round(aiGeneratedScore * 100) / 100,
        isGenuine: deepfakeScore < 0.3 && aiGeneratedScore < 0.3,
        simulated: isSimulated,
      };
    }
  } catch (error) {
    console.warn('AI detection API failed, using local simulation:', error);
  }

  // Fallback: simulate AI detection (for demo / when backend is cold)
  return simulateAIDetection();
}

// Simulated AI detection for demo
function simulateAIDetection(): AIDetectionResult {
  // Simulate genuine media (typical real photo scores)
  const deepfakeScore = Math.random() * 0.15; // 0-15% fake likelihood
  const aiGeneratedScore = Math.random() * 0.1; // 0-10% AI generated
  return {
    deepfakeScore: Math.round(deepfakeScore * 100) / 100,
    aiGeneratedScore: Math.round(aiGeneratedScore * 100) / 100,
    isGenuine: true,
    simulated: true,
  };
}

// Plagiarism / reverse image search
export async function checkPlagiarism(imageBase64: string): Promise<PlagiarismResult> {
  try {
    if (!imageBase64 || imageBase64.length === 0) {
      return simulatePlagiarism();
    }

    // Create temporary file from base64 for multipart upload
    const tmpUri = FileSystem.cacheDirectory + `plag_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tmpUri, imageBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const uploadResult = await withTimeout(
      FileSystem.uploadAsync(
        `${API_BASE_URL}/api/plagiarism`,
        tmpUri,
        {
          fieldName: 'media',
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        }
      ),
      API_TIMEOUT,
      'Plagiarism check'
    );

    // Clean up temp file
    try { await FileSystem.deleteAsync(tmpUri, { idempotent: true }); } catch { }

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      const data = JSON.parse(uploadResult.body);
      return {
        isOriginal: data.isOriginal ?? true,
        matchPercentage: data.plagiarismScore ?? data.matchPercentage ?? 0,
        sources: data.matches?.map((m: any) => m.source) ?? [],
        simulated: data.simulated === true,
      };
    }
  } catch (error) {
    console.warn('Plagiarism API failed, using simulation:', error);
  }

  return simulatePlagiarism();
}

function simulatePlagiarism(): PlagiarismResult {
  return {
    isOriginal: true,
    matchPercentage: Math.floor(Math.random() * 5),
    sources: [],
    simulated: true,
  };
}
