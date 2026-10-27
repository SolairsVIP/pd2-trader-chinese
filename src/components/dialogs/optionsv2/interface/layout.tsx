import React from 'react';
import { SettingsSection } from '../settings-ui';
import { InterfaceForm } from './interface-form';
import { ThemePicker } from './theme-picker';
import { useOptions } from '@/hooks/useOptions';
import { zoneText } from '@/pages/corrupted-zone/language';

export default function SettingsInterface() {
  const { settings } = useOptions();
  const t = (text: string) => zoneText(text, settings.uiLanguage);
  return (
    <div className="flex flex-col gap-y-10">
      <SettingsSection title={t('界面')} description={t('配置界面和游戏内浮窗。')}>
        <InterfaceForm />
      </SettingsSection>
      <SettingsSection title={t('主题')} description={t('设置所有浮窗的配色主题，更改会立即生效。')}>
        <ThemePicker />
      </SettingsSection>
    </div>
  );
}
