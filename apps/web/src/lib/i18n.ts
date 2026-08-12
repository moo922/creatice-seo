import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { ar } from '../i18n/ar';
import { en } from '../i18n/en';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export function applyDirection(language: string): void {
  const isRtl = language === 'ar';
  document.documentElement.lang = language;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
}

i18n.on('languageChanged', (language) => applyDirection(language));
applyDirection(i18n.language);

export default i18n;
