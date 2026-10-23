import React from 'react';
import { SettingsSection } from '../settings-ui';
import { NetWorthForm } from './networth-form';

export default function SettingsNetWorth() {
  return (
    <SettingsSection title="仓库估值"
      description="追踪仓库价值变化，并在游戏中显示估值浮窗。">
      <NetWorthForm />
    </SettingsSection>
  );
}
