// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiLanguageProvider, translateUi } from './ui-language';
import { ChatButton } from '@/components/custom/ChatButton';

afterEach(cleanup);
describe('UI language', () => {
  it('switches the dock text and keeps actions working', () => {
    const open = vi.fn();
    const component = (language: 'zh-CN' | 'zh-TW') => <UiLanguageProvider value={language}><ChatButton size={{width: 40, height: 110}} onChatClick={open} onOffersClick={vi.fn()} /></UiLanguageProvider>;
    const { rerender } = render(component('zh-CN'));
    expect(screen.getByRole('button', {name: '打开 PD2 聊天'})).toBeTruthy();
    rerender(component('zh-TW'));
    fireEvent.click(screen.getByRole('button', {name: '打開 PD2 聊天'}));
    expect(open).toHaveBeenCalledOnce();
    rerender(component('zh-CN'));
    expect(screen.getByRole('button', {name: '打开 PD2 聊天'})).toBeTruthy();
  });
  it('uses phrase conversion for display labels and keeps simplified unchanged', () => {
    expect(translateUi('使用 PD2 账号登录', 'zh-CN')).toBe('使用 PD2 账号登录');
    expect(translateUi('使用 PD2 账号登录', 'zh-TW')).toBe('使用 PD2 帳號登錄');
  });
});
