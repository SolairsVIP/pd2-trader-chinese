import React from 'react';
import { SettingsSection } from '../settings-ui';
import { InterfaceForm } from './interface-form';
import { ThemePicker } from './theme-picker';

export default function SettingsInterface() {
  return (
    <div className="flex flex-col gap-y-10">
      <SettingsSection title="界面"
        description="配置界面和游戏内浮窗。">
        <InterfaceForm />
      </SettingsSection>
      <SettingsSection title="主题"
        description="设置所有浮窗的配色主题，更改会立即生效。">
        <ThemePicker />
      </SettingsSection>
    </div>
  );
}
