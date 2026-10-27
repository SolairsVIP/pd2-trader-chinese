import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { SettingsSection } from '../settings-ui';
import { ChatForm } from './chat-form';

export default function SettingsChat() {
  const __ui = useUiText();
  return (
    <SettingsSection title={__ui("聊天")}
      description={__ui("配置聊天、密语通知和消息模板。")}>
      <ChatForm />
    </SettingsSection>
  );
}
