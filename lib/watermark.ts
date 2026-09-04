import * as FileSystem from 'expo-file-system/legacy';

// Apply a visible text watermark by creating a watermarked copy.
// Since react-native-image-marker requires native module,
// we simulate watermarking by copying the file with a watermark indicator.
// The real watermark is rendered in the UI overlay.

export async function applyVisibleWatermark(
  imageUri: string,
  trustScore: number,
  trustGrade: string
): Promise<string> {
  try {
    const dirUri = FileSystem.documentDirectory + 'watermarked/';
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    const fileName = `wm_${Date.now()}_${trustGrade}.jpg`;
    const destUri = dirUri + fileName;

    // Copy the original file to the watermarked directory
    await FileSystem.copyAsync({ from: imageUri, to: destUri });

    return destUri;
  } catch (error) {
    console.warn('Watermark failed, returning original:', error);
    return imageUri;
  }
}

// Generate invisible watermark ID (simulated for hackathon)
export function generateInvisibleWatermarkId(): string {
  return 'PS-' + Date.now().toString(36).toUpperCase() + '-' +
    Math.random().toString(36).substring(2, 8).toUpperCase();
}
