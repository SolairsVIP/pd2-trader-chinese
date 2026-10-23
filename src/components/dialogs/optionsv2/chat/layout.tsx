import React from 'react';
import { SettingsSection } from '../settings-ui';
import { ChatForm } from './chat-form';

export default function SettingsChat() {
  return (
    <SettingsSection title="聊天"
      description="配置聊天、密语通知和消息模板。">
      <ChatForm />
    </SettingsSection>
  );
}
