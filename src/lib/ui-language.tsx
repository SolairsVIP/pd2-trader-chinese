import * as React from 'react';
import { zoneText, type UiLanguage } from '@/pages/corrupted-zone/language';

const LanguageContext = React.createContext<UiLanguage>('zh-CN');
export const UiLanguageProvider = LanguageContext.Provider;
/** Only call for application-owned display text, never account names or messages. */
export function translateUi(text: string, language: UiLanguage): string {
  return zoneText(text, language);
}
export function useUiText() {
  const language = React.useContext(LanguageContext);
  return React.useCallback((text: string) => translateUi(text, language), [language]);
}
