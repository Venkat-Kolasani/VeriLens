import * as MediaLibrary from 'expo-media-library';
import { hashMediaFile } from './crypto';
import {
  insertScannedImage,
  updateScannedImage,
  isAssetScanned,
  getScannedByAssetId,
  getAllScannedImages,
  getScannerStats,
  type ScannedImage,
} from './gallery-db';

// ═══════════════════════════════════════════════════════════
//  Gallery Auto-Scanner (Module 2)
//  Scans device gallery → hashes new images → detects tampering
//  Targets: WhatsApp, Snapchat, Camera, Downloads, etc.
// ═══════════════════════════════════════════════════════════

// Known album names by platform
const TRACKED_ALBUMS: Record<string, string> = {
  // Android
  'WhatsApp Images': 'WhatsApp',
  'WhatsApp Video': 'WhatsApp',
  'WhatsApp Animated Gifs': 'WhatsApp',
  'Snapchat': 'Snapchat',
  'Instagram': 'Instagram',
  'Telegram': 'Telegram',
  'Camera': 'Camera',
  'DCIM': 'Camera',
  'Screenshots': 'Screenshots',
  'Download': 'Downloads',
  'Downloads': 'Downloads',
  // iOS
  'Recents': 'Camera',
  'All Photos': 'Camera',
};

// Detect the source app from album name or file path
function detectSource(asset: MediaLibrary.Asset, albumName?: string | null): string {
  // Check album name first
  if (albumName) {
    for (const [pattern, source] of Object.entries(TRACKED_ALBUMS)) {
      if (albumName.toLowerCase().includes(pattern.toLowerCase())) {
        return source;
      }
    }
  }

  // Check filename/URI patterns
  const fname = (asset.filename ?? '').toLowerCase();
  const uri = (asset.uri ?? '').toLowerCase();

  if (fname.includes('whatsapp') || uri.includes('whatsapp')) return 'WhatsApp';
  if (fname.includes('snap') || uri.includes('snapchat')) return 'Snapchat';
  if (fname.includes('instagram') || uri.includes('instagram')) return 'Instagram';
  if (fname.includes('telegram') || uri.includes('telegram')) return 'Telegram';
  if (fname.startsWith('img_') || fname.startsWith('dsc')) return 'Camera';
  if (fname.includes('screenshot')) return 'Screenshots';
  if (uri.includes('download')) return 'Downloads';

  return 'Other';
}

export interface ScanProgress {
  phase: 'requesting-permission' | 'loading-albums' | 'scanning' | 'hashing' | 're-checking' | 'done';
  current: number;
  total: number;
  newImages: number;
  tamperedCount: number;
  message: string;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

// ──── Request permissions ────

export async function requestGalleryPermission(): Promise<boolean> {
  // Request only photo & video — never audio. The expo-media-library
  // config plugin does NOT declare READ_MEDIA_AUDIO, so requesting it
  // causes a native rejection.  Do NOT fall back to a bare
  // requestPermissionsAsync() call (no granular types) because that
  // defaults to requesting audio on newer Android SDKs.
  const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync(
    false,              // writeOnly = false (need read access)
    ['photo', 'video'], // granular: explicitly skip 'audio'
  );

  if (status === 'granted') return true;

  // Already denied and can't ask again — user must enable in Settings.
  if (!canAskAgain) return false;

  return false;
}

// ──── Main scan function ────

export async function scanGalleryForNewImages(
  onProgress?: ScanProgressCallback,
  limit: number = 200
): Promise<{
  newlyScanned: number;
  tamperedFound: number;
  totalScanned: number;
}> {
  let newlyScanned = 0;
  let tamperedFound = 0;

  // Phase 1: Request permission
  onProgress?.({
    phase: 'requesting-permission',
    current: 0, total: 0, newImages: 0, tamperedCount: 0,
    message: 'Requesting gallery access...',
  });

  const hasPermission = await requestGalleryPermission();
  if (!hasPermission) {
    throw new Error('Gallery permission denied. Please allow access in Settings.');
  }

  // Phase 2: Load albums to determine source
  onProgress?.({
    phase: 'loading-albums',
    current: 0, total: 0, newImages: 0, tamperedCount: 0,
    message: 'Loading gallery albums...',
  });

  // Build album→name mapping
  const albumMap = new Map<string, string>();
  try {
    const albums = await MediaLibrary.getAlbumsAsync();
    for (const album of albums) {
      albumMap.set(album.id, album.title);
    }
  } catch {
    // Album listing may fail on some devices, continue without it
  }

  // Phase 3: Fetch recent assets
  onProgress?.({
    phase: 'scanning',
    current: 0, total: 0, newImages: 0, tamperedCount: 0,
    message: 'Scanning gallery...',
  });

  const assets = await MediaLibrary.getAssetsAsync({
    mediaType: [MediaLibrary.MediaType.photo],
    first: limit,
    sortBy: [MediaLibrary.SortBy.creationTime],
  });

  const totalAssets = assets.assets.length;

  // Phase 4: Process each image
  for (let i = 0; i < totalAssets; i++) {
    const asset = assets.assets[i];
    const scannedBefore = await isAssetScanned(asset.id);

    if (!scannedBefore) {
      // NEW IMAGE — hash it for the first time
      onProgress?.({
        phase: 'hashing',
        current: i + 1,
        total: totalAssets,
        newImages: newlyScanned,
        tamperedCount: tamperedFound,
        message: `Hashing new image ${i + 1}/${totalAssets}...`,
      });

      try {
        // Get full asset info for URI
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        const localUri = assetInfo.localUri ?? asset.uri;

        const hash = await hashMediaFile(localUri);

        // Determine album name
        let albumName: string | null = null;
        if (assetInfo.albumId) {
          albumName = albumMap.get(assetInfo.albumId) ?? null;
        }

        const source = detectSource(asset, albumName);
        const now = new Date().toISOString();

        const record: ScannedImage = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
          assetId: asset.id,
          uri: localUri,
          fileName: asset.filename ?? `image_${asset.id}`,
          fileSize: (assetInfo as any).fileSize ?? 0,
          originalHash: hash,
          currentHash: hash,
          source,
          isTampered: false,
          lastCheckedAt: now,
          createdAt: now,
          albumName,
        };

        await insertScannedImage(record);
        newlyScanned++;
      } catch (err) {
        console.warn(`[Scanner] Failed to hash asset ${asset.id}:`, err);
      }
    } else {
      // EXISTING IMAGE — re-hash and compare
      onProgress?.({
        phase: 're-checking',
        current: i + 1,
        total: totalAssets,
        newImages: newlyScanned,
        tamperedCount: tamperedFound,
        message: `Re-checking image ${i + 1}/${totalAssets}...`,
      });

      try {
        const existing = await getScannedByAssetId(asset.id);
        if (existing) {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
          const localUri = assetInfo.localUri ?? asset.uri;
          const currentHash = await hashMediaFile(localUri);

          const isTampered = currentHash !== existing.originalHash;
          if (isTampered) {
            tamperedFound++;
          }

          await updateScannedImage(asset.id, {
            currentHash,
            isTampered,
            lastCheckedAt: new Date().toISOString(),
            uri: localUri,
          });
        }
      } catch (err) {
        console.warn(`[Scanner] Failed to re-check asset ${asset.id}:`, err);
      }
    }
  }

  // Phase 5: Done
  const stats = await getScannerStats();

  onProgress?.({
    phase: 'done',
    current: totalAssets,
    total: totalAssets,
    newImages: newlyScanned,
    tamperedCount: tamperedFound,
    message: `Done! ${newlyScanned} new, ${tamperedFound} tampered`,
  });

  return {
    newlyScanned,
    tamperedFound,
    totalScanned: stats.totalScanned,
  };
}

// ──── Re-verify a single image (manual check) ────

export async function reverifyImage(assetId: string): Promise<{
  isTampered: boolean;
  originalHash: string;
  currentHash: string;
} | null> {
  const existing = await getScannedByAssetId(assetId);
  if (!existing) return null;

  try {
    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
    const localUri = assetInfo.localUri ?? existing.uri;
    const currentHash = await hashMediaFile(localUri);
    const isTampered = currentHash !== existing.originalHash;

    await updateScannedImage(assetId, {
      currentHash,
      isTampered,
      lastCheckedAt: new Date().toISOString(),
      uri: localUri,
    });

    return {
      isTampered,
      originalHash: existing.originalHash,
      currentHash,
    };
  } catch (err) {
    console.warn('[Scanner] Re-verify failed:', err);
    return null;
  }
}

// ──── Get all scanned results ────

export { getAllScannedImages, getScannerStats } from './gallery-db';
export type { ScannedImage } from './gallery-db';
