import { usePreferences } from '../stores/preferences';
import { fr } from './fr';
import { en } from './en';
export type TranslationKey = keyof typeof fr;
export function useT() {
  const language = usePreferences((s) => s.language);
  return (key: TranslationKey) => (language === 'en' ? en : fr)[key];
}
