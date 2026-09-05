// VeriLens Theme & Color Constants
//
// Black-and-yellow forensics identity, not the generic-template blue. #F5C400
// is the one accent yellow used everywhere a tint/icon/link color is needed —
// picked because it still reads as legible text/icon color against the
// #0A0A0A/#161616 dark surfaces below, not just as a decorative swatch.
// `success`/`danger`/`warning` stay their existing green/red/amber so the
// verdict colors (ACCEPT/REJECT/REVIEW) are never confused with UI chrome.
export const Colors = {
  primary: {
    50: '#FFFDF2',
    100: '#FFF7CC',
    200: '#FFEB99',
    300: '#FFDD5C',
    400: '#FFD027',
    500: '#F5C400',
    600: '#CCA200',
    700: '#997A00',
    800: '#665200',
    900: '#332900',
  },
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  light: {
    background: '#FAFAFA',
    card: '#FFFFFF',
    elevated: '#F0F0F0',
    text: '#141414',
    textSecondary: '#6B6B6B',
    border: '#E5E5E5',
    icon: '#8A8A8A',
    tint: '#997A00',
    tabIconDefault: '#8A8A8A',
    tabIconSelected: '#997A00',
  },
  dark: {
    background: '#0A0A0A',
    card: '#161616',
    elevated: '#242424',
    text: '#F5F5F5',
    textSecondary: '#A3A3A3',
    border: '#2A2A2A',
    icon: '#8A8A8A',
    tint: '#F5C400',
    tabIconDefault: '#6B6B6B',
    tabIconSelected: '#F5C400',
  },
};

// Backend API URL (Render free tier)
// MOVED TO constants/config.ts — import from there instead

// Re-export from config.ts for backward compatibility
export { API_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, CHAIN_RPC, CHAIN_ID, CHAIN_NAME, CHAIN_CURRENCY, CHAIN_EXPLORER, CHAIN_FAUCET, BLOCK_EXPLORER, CONTRACT_ADDRESS } from './config';
