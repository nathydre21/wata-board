import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ICU from 'i18next-icu';

// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import zh from './locales/zh.json';
import ar from './locales/ar.json';
import hi from './locales/hi.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import pa from './locales/pa.json';

// Supported languages configuration
export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', flag: '🇮🇳' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr', flag: '🇯🇵' },
  { code: 'pa', name: 'Nigerian Pidgin', nativeName: 'Naija Pidgin', dir: 'ltr', flag: '🇳🇬' }
] as const;

// Resources object with all translations
const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  zh: { translation: zh },
  ar: { translation: ar },
  hi: { translation: hi },
  pt: { translation: pt },
  ru: { translation: ru },
  ja: { translation: ja },
  pa: { translation: pa }
};

// Default language
const defaultLanguage = 'en';

// Initialize i18n
// Note: i18next-icu plugin chain creates a type mismatch with TS overloads.
// We use type assertion to bridge the gap between ICU-enhanced i18n and standard init options.
i18n
  .use(ICU)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: defaultLanguage,
    debug: process.env.NODE_ENV === 'development',
    
    // Language detection configuration
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'],
      lookupLocalStorage: 'wata-board-language',
      checkWhitelist: true
    },
    
    // ICU MessageFormat pluralization configuration
    // Supports: {count, plural, =0 {none} one {# item} other {# items}}
    // Supports: {gender, select, male {He} female {She} other {They}}
    // Supports: {value, number, ::currency/USD} and {value, number, ::compact-long}
    
    // Interpolation configuration
    interpolation: {
      escapeValue: false,
      formatSeparator: ',',
      format: function(value: string, format: string, lng: string | undefined) {
        if (format === 'uppercase') return value.toUpperCase();
        if (format === 'lowercase') return value.toLowerCase();
        if (format === 'capitalize') return value.charAt(0).toUpperCase() + value.slice(1);
        return value;
      }
    },
    
    // React configuration
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em', 'span']
    },
    
    // Whitelist of supported languages
    supportedLngs: supportedLanguages.map(lang => lang.code),
    
    // Load configuration
    load: 'languageOnly',
    
    // Preload languages for better performance
    preload: ['en', 'es', 'fr', 'de', 'zh']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

// Export i18n instance and utilities
export default i18n;

// Helper function to get current language info
export const getCurrentLanguage = () => {
  const currentCode = i18n.language;
  return supportedLanguages.find(lang => lang.code === currentCode) || supportedLanguages[0];
};

// Helper function to change language
export const changeLanguage = async (languageCode: string) => {
  try {
    await i18n.changeLanguage(languageCode);
    
    // Update document direction for RTL languages
    const langInfo = supportedLanguages.find(lang => lang.code === languageCode);
    if (langInfo) {
      document.documentElement.dir = langInfo.dir;
      document.documentElement.lang = languageCode;
    }
    
    // Store preference
    localStorage.setItem('wata-board-language', languageCode);
    
    return true;
  } catch (error) {
    console.error('Failed to change language:', error);
    return false;
  }
};

// Helper function to get text direction for a language
export const getTextDirection = (languageCode: string) => {
  const langInfo = supportedLanguages.find(lang => lang.code === languageCode);
  return langInfo?.dir || 'ltr';
};

// Helper function to check if language is RTL
export const isRTL = (languageCode?: string) => {
  const langCode = languageCode || i18n.language;
  return getTextDirection(langCode) === 'rtl';
};

// Helper function to format numbers with locale
// Uses Intl.NumberFormat for proper locale-aware number formatting
export const formatNumber = (number: number, options?: Intl.NumberFormatOptions) => {
  const locale = i18n.language === 'zh' ? 'zh-CN' : i18n.language;
  try {
    return new Intl.NumberFormat(locale, options).format(number);
  } catch {
    return new Intl.NumberFormat('en', options).format(number);
  }
};

// Helper function to format currency with full locale support
// Supports any ISO 4217 currency code with appropriate locale formatting
export const formatCurrency = (amount: number, currency = 'XLM', options?: Intl.NumberFormatOptions) => {
  const locale = i18n.language === 'zh' ? 'zh-CN' : i18n.language;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      ...options
    }).format(amount);
  } catch {
    // Fallback for currencies not supported by Intl (like XLM)
    return new Intl.NumberFormat('en', {
      style: 'decimal',
      minimumFractionDigits: 7,
      maximumFractionDigits: 7,
      ...options
    }).format(amount) + ' ' + currency;
  }
};

// Helper function to format dates with full locale support
export const formatDate = (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
  const locale = i18n.language === 'zh' ? 'zh-CN' : i18n.language;
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      ...options
    }).format(dateObj);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(new Date(date));
  }
};

// Helper function to format relative time (e.g., "3 days ago")
export const formatRelativeTime = (date: Date | number | string, locale?: string) => {
  const loc = locale || i18n.language;
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = dateObj.getTime() - now.getTime();
    const diffSeconds = Math.round(diffMs / 1000);
    const absSeconds = Math.abs(diffSeconds);
    
    const rtf = new Intl.RelativeTimeFormat(loc === 'zh' ? 'zh-CN' : loc, { numeric: 'auto' });
    
    const units: [string, number][] = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1]
    ];
    
    for (const [unit, seconds] of units) {
      const value = Math.round(absSeconds / seconds);
      if (value >= 1 || unit === 'second') {
        return rtf.format(diffSeconds >= 0 ? value : -value, unit as Intl.RelativeTimeFormatUnit);
      }
    }
    
    return rtf.format(0, 'second');
  } catch {
    return formatDate(date);
  }
};

// Helper function to get plural form using Intl.PluralRules (ICU-compliant)
// Returns the CLDR plural category: 'zero', 'one', 'two', 'few', 'many', 'other'
export const getPluralForm = (count: number, locale?: string) => {
  const loc = locale || i18n.language;
  try {
    const pluralRules = new Intl.PluralRules(loc === 'zh' ? 'zh-CN' : loc);
    return pluralRules.select(count);
  } catch {
    const pluralRules = new Intl.PluralRules('en');
    return pluralRules.select(count);
  }
};
