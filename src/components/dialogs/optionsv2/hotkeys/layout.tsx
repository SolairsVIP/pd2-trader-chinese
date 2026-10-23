import React from 'react';
import { SettingsSection } from '../settings-ui';
import { HotkeyForm } from './hotkey-form';

export default function SettingsHotkeys() {
  return (
    <SettingsSection title="快捷键"
      description="配置各项功能的快捷键。">
      <HotkeyForm />
    </SettingsSection>
  );
}
