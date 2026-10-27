import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { GeneralForm } from './general-form';

export default function SettingGenereal() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("常规")}
      description={__ui("应用的常规设置。")}>
      <GeneralForm />
    </SettingsSection>
  );
}
