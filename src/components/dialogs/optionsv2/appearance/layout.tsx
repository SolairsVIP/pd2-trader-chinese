import React from 'react';
import { SettingsSection } from '../settings-ui';
import { GeneralForm } from './general-form';

export default function SettingGenereal() {
  return (
    <SettingsSection title="常规"
      description="应用的常规设置。">
      <GeneralForm />
    </SettingsSection>
  );
}
