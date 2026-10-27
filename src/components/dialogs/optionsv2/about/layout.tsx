import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { AboutForm } from './about-form';

export default function SettingsAbout() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("关于")}
      description={__ui("查看应用版本和开发者信息。")}>
      <AboutForm />
    </SettingsSection>
  );
}
