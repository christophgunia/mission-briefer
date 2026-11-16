import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { de } from './de';
import { en } from './en';

const saved = (() => {
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: saved ?? (navigator.language.startsWith('de') ? 'de' : 'en'),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: 'de' | 'en') {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem('lang', lng);
  } catch {
    /* ignore */
  }
}

export default i18n;
