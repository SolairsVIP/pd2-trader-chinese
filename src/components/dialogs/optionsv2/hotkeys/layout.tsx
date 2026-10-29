import { useUiText } from '@/lib/ui-language';
import { SettingsSection } from '../settings-ui';
import { HotkeyForm } from './hotkey-form';

export default function SettingsHotkeys() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("快捷键")}
      description={__ui("配置各项功能的快捷键。")}>
      <HotkeyForm />
    </SettingsSection>
  );
}
