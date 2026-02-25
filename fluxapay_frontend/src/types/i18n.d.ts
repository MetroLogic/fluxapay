/**
 * Type definitions for i18n
 * 
 * This file provides type safety for translation keys.
 * Uncomment and customize based on your translation structure.
 */

// Import your English messages as the source of truth
// type Messages = typeof import('../../messages/en.json');

// Declare the type for useTranslations
// declare global {
//   interface IntlMessages extends Messages {}
// }

/**
 * Supported locale codes
 */
export type Locale = 'en' | 'fr' | 'pt';

/**
 * Supported currency codes
 */
export type CurrencyCode = 
  | 'USD' 
  | 'EUR' 
  | 'GBP' 
  | 'NGN' 
  | 'KES' 
  | 'ZAR' 
  | 'BRL' 
  | 'MXN'
  | 'BTC'
  | 'ETH'
  | 'USDC'
  | 'USDT';

/**
 * Payment status types
 */
export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'expired';

/**
 * Translation namespace keys
 * Add your namespaces here for better autocomplete
 */
export type TranslationNamespace =
  | 'common'
  | 'nav'
  | 'hero'
  | 'whyFluxapay'
  | 'bridges'
  | 'globalReach'
  | 'useCases'
  | 'faq'
  | 'footer'
  | 'dashboard'
  | 'payment'
  | 'auth'
  | 'settings'
  | 'currency'
  | 'status'
  | 'errors';

/**
 * Locale display names
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  pt: 'Português',
};

/**
 * Locale flags (emoji)
 */
export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
  pt: '🇧🇷',
};

/**
 * Currency display names
 */
export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  NGN: 'Nigerian Naira',
  KES: 'Kenyan Shilling',
  ZAR: 'South African Rand',
  BRL: 'Brazilian Real',
  MXN: 'Mexican Peso',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  USDC: 'USD Coin',
  USDT: 'Tether',
};

export {};
