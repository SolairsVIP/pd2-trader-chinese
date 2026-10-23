import React from 'react';
import { SettingsSection } from '../settings-ui';
import { AccountForm } from './account-form';

export default function SettingsAccount() {
  return (
    <SettingsSection title="账户"
      description="管理账户及登录状态。">
      <AccountForm />
    </SettingsSection>
  );
}
