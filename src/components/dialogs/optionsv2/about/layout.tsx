import React from 'react';
import { SettingsSection } from '../settings-ui';
import { AboutForm } from './about-form';

export default function SettingsAbout() {
  return (
    <SettingsSection title="关于"
      description="查看应用版本和开发者信息。">
      <AboutForm />
    </SettingsSection>
  );
}
