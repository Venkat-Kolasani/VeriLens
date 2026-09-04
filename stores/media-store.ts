import { create } from 'zustand';
import type { KYCCase, VerificationStep } from '@/lib/types';
import { getAllCases, getStats } from '@/lib/db';
import { runKycCheck } from '@/lib/pipeline';
import { hasKeys, generateKeyPair, getPublicKey } from '@/lib/crypto';
import { getWalletAddress, getWalletBalance } from '@/lib/blockchain';

interface AppState {
  // Auth & Keys
  isInitialized: boolean;
  hasKeyPair: boolean;
  publicKey: string | null;
  walletAddress: string | null;
  walletBalance: string;

  // Cases
  cases: KYCCase[];
  currentCheck: {
    steps: VerificationStep[];
    isRunning: boolean;
    result: KYCCase | null;
  } | null;

  // Stats
  stats: { total: number; accepted: number; review: number; onChain: number };

  // Theme
  onboardingDone: boolean;

  // Actions
  initialize: () => Promise<void>;
  setupKeys: () => Promise<void>;
  loadCases: () => Promise<void>;
  refreshStats: () => Promise<void>;
  startKycCheck: (
    idImageUri: string,
    selfieUri: string,
    idAttested: boolean
  ) => Promise<KYCCase>;
  clearCheck: () => void;
  setOnboardingDone: () => void;
  refreshWallet: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  hasKeyPair: false,
  publicKey: null,
  walletAddress: null,
  walletBalance: '0.0',
  cases: [],
  currentCheck: null,
  stats: { total: 0, accepted: 0, review: 0, onChain: 0 },
  onboardingDone: false,

  initialize: async () => {
    try {
      const keyExists = await hasKeys();
      let pk: string | null = null;
      if (keyExists) {
        pk = await getPublicKey();
      }
      const cases = await getAllCases();
      const stats = await getStats();

      set({
        isInitialized: true,
        hasKeyPair: keyExists,
        publicKey: pk,
        cases,
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

  loadCases: async () => {
    const cases = await getAllCases();
    set({ cases });
  },

  refreshStats: async () => {
    const stats = await getStats();
    set({ stats });
  },

  startKycCheck: async (idImageUri: string, selfieUri: string, idAttested: boolean) => {
    set({ currentCheck: { steps: [], isRunning: true, result: null } });

    try {
      const kycCase = await runKycCheck(idImageUri, selfieUri, idAttested, (steps) => {
        set((state) => ({
          currentCheck: state.currentCheck
            ? { ...state.currentCheck, steps }
            : null,
        }));
      });

      set((state) => ({
        currentCheck: state.currentCheck
          ? { ...state.currentCheck, isRunning: false, result: kycCase }
          : null,
      }));

      await get().loadCases();
      await get().refreshStats();

      return kycCase;
    } catch (error) {
      set((state) => ({
        currentCheck: state.currentCheck
          ? { ...state.currentCheck, isRunning: false }
          : null,
      }));
      throw error;
    }
  },

  clearCheck: () => {
    set({ currentCheck: null });
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
