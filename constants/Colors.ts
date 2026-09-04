// ProofSnap Theme & Color Constants
export const Colors = {
  primary: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  light: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    elevated: '#F1F5F9',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    icon: '#94A3B8',
    tint: '#3B82F6',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#3B82F6',
  },
  dark: {
    background: '#0F172A',
    card: '#1E293B',
    elevated: '#334155',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#334155',
    icon: '#64748B',
    tint: '#60A5FA',
    tabIconDefault: '#64748B',
    tabIconSelected: '#60A5FA',
  },
};

export const GRADES = {
  S: { label: 'S', color: '#3B82F6', bg: '#EFF6FF', darkBg: '#1E3A8A' },
  A: { label: 'A', color: '#10B981', bg: '#ECFDF5', darkBg: '#064E3B' },
  B: { label: 'B', color: '#F59E0B', bg: '#FFFBEB', darkBg: '#78350F' },
  C: { label: 'C', color: '#F97316', bg: '#FFF7ED', darkBg: '#7C2D12' },
  F: { label: 'F', color: '#EF4444', bg: '#FEF2F2', darkBg: '#7F1D1D' },
} as const;

export type GradeKey = keyof typeof GRADES;

export function getGrade(score: number): GradeKey {
  if (score >= 95) return 'S';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'F';
}

// Backend API URL (Render free tier)
// MOVED TO constants/config.ts — import from there instead

// Re-export from config.ts for backward compatibility
export { API_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, CHAIN_RPC, CHAIN_ID, CHAIN_NAME, CHAIN_CURRENCY, CHAIN_EXPLORER, CHAIN_FAUCET, BLOCK_EXPLORER, CONTRACT_ADDRESS } from './config';
