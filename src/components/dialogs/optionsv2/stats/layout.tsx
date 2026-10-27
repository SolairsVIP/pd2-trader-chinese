import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { StatsForm } from './stats-form';

export default function SettingsStats() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("物品估价")}
      description={__ui("设置估价所用的价格区间，以及搜索属性范围和筛选条件的填充方式。")}>
      <StatsForm />
    </SettingsSection>
  );
}
