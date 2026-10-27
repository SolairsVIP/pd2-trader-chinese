import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { AccountForm } from './account-form';

export default function SettingsAccount() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("账户")}
      description={__ui("管理账户及登录状态。")}>
      <AccountForm />
    </SettingsSection>
  );
}
