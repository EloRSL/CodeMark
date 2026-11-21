import 'i18next';
import type en from './locales/en.json';

// t() accepts only keys that exist in en.json; check:i18n keeps sl.json equal.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
