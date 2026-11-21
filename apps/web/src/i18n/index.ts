import type { Locale } from '@codemark/contracts';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sl from './locales/sl.json';

// The language this browser chose last, for pages before sign-in. Signed in, Me.locale wins.
const STORAGE_KEY = 'locale';

function savedLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'sl';
  } catch {
    return 'sl';
  }
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { sl: { translation: sl }, en: { translation: en } },
  lng: savedLocale(),
  fallbackLng: 'sl',
  interpolation: { escapeValue: false }, // React escapes
});

/** Switches the interface language and remembers it in this browser. */
export function setLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage blocked: the choice lasts until reload
  }
}
