import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { NetWorthForm } from './networth-form';

export default function SettingsNetWorth() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("仓库估值")}
      description={__ui("追踪仓库价值变化，并在游戏中显示估值浮窗。")}>
      <NetWorthForm />
    </SettingsSection>
  );
}
