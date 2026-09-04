import { create } from 'zustand';
import type { MediaRecord, VerificationStep } from '@/lib/types';
import { getAllRecords, getStats } from '@/lib/db';
import { runVerificationPipeline } from '@/lib/pipeline';
import { hasKeys, generateKeyPair, getPublicKey } from '@/lib/crypto';
import { getWalletAddress, getWalletBalance } from '@/lib/blockchain';

interface AppState {
  // Auth & Keys
  isInitialized: boolean;
  hasKeyPair: boolean;
  publicKey: string | null;
  walletAddress: string | null;
  walletBalance: string;

  // Media
  records: MediaRecord[];
  currentVerification: {
    steps: VerificationStep[];
    isRunning: boolean;
    result: MediaRecord | null;
  } | null;

  // Stats
  stats: { total: number; verified: number; onChain: number };

  // Theme
  onboardingDone: boolean;

  // Actions
  initialize: () => Promise<void>;
  setupKeys: () => Promise<void>;
  loadRecords: () => Promise<void>;
  refreshStats: () => Promise<void>;
  startVerification: (fileUri: string, fileType: 'image' | 'video') => Promise<MediaRecord>;
  clearVerification: () => void;
  setOnboardingDone: () => void;
  refreshWallet: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  hasKeyPair: false,
  publicKey: null,
  walletAddress: null,
  walletBalance: '0.0',
  records: [],
  currentVerification: null,
  stats: { total: 0, verified: 0, onChain: 0 },
  onboardingDone: false,

  initialize: async () => {
    try {
      const keyExists = await hasKeys();
      let pk: string | null = null;
      if (keyExists) {
        pk = await getPublicKey();
      }
      const records = await getAllRecords();
      const stats = await getStats();

      set({
        isInitialized: true,
        hasKeyPair: keyExists,
        publicKey: pk,
        records,
        stats,
        onboardingDone: keyExists,
      });

      // Load wallet info in background
      if (keyExists) {
        get().refreshWallet();
      }
    } catch (error) {
      console.error('Init error:', error);
      set({ isInitialized: true });
    }
  },

  setupKeys: async () => {
    const { publicKey } = await generateKeyPair();
    set({ hasKeyPair: true, publicKey, onboardingDone: true });
    get().refreshWallet();
  },

  loadRecords: async () => {
    const records = await getAllRecords();
    set({ records });
  },

  refreshStats: async () => {
    const stats = await getStats();
    set({ stats });
  },

  startVerification: async (fileUri: string, fileType: 'image' | 'video') => {
    set({
      currentVerification: {
        steps: [],
        isRunning: true,
        result: null,
      },
    });

    try {
      const record = await runVerificationPipeline(
        fileUri,
        fileType,
        (steps) => {
          set((state) => ({
            currentVerification: state.currentVerification
              ? { ...state.currentVerification, steps }
              : null,
          }));
        }
      );

      set((state) => ({
        currentVerification: state.currentVerification
          ? { ...state.currentVerification, isRunning: false, result: record }
          : null,
      }));

      // Refresh records and stats
      await get().loadRecords();
      await get().refreshStats();

      return record;
    } catch (error) {
      set((state) => ({
        currentVerification: state.currentVerification
          ? { ...state.currentVerification, isRunning: false }
          : null,
      }));
      throw error;
    }
  },

  clearVerification: () => {
    set({ currentVerification: null });
  },

  setOnboardingDone: () => {
    set({ onboardingDone: true });
  },

  refreshWallet: async () => {
    try {
      const [address, balance] = await Promise.all([
        getWalletAddress(),
        getWalletBalance(),
      ]);
      set({ walletAddress: address, walletBalance: balance });
    } catch (error) {
      console.warn('Wallet refresh failed:', error);
    }
  },
}));
