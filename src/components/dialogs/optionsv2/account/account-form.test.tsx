// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { isTauri } from '@tauri-apps/api/core';
import { useOptions } from '@/hooks/useOptions';
import type { ISettings } from '@/hooks/useOptions';
import { usePd2Website } from '@/hooks/pd2website/usePD2Website';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import { AccountForm } from './account-form';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn() }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/hooks/pd2website/usePD2Website', () => ({ usePd2Website: vi.fn() }));
// vi.mock factories are hoisted above static imports, so the shim must be loaded inside the factory.
vi.mock('@/components/ui/select', async () => (await import('../test-utils')).selectShim);

let store: OptionsStore;
const logout = vi.fn();
const startOAuthFlow = vi.fn();

function renderForm(authData: unknown, settings: Partial<ISettings> = { account: '', pd2Token: '' }) {
  store = createOptionsStore(settings);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  // The context type is module-private; the form only reads these three members.
  vi.mocked(usePd2Website).mockReturnValue({ authData, logout, startOAuthFlow } as never);
  return render(<AccountForm />);
}

const signedIn = (accounts: string[], username: string | null = 'Doreet') => ({
  user: { username: username ?? undefined, game: { accounts } },
});
const accountSelect = () => screen.getByLabelText('账户') as HTMLSelectElement;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(true);
  logout.mockReset();
  startOAuthFlow.mockReset();
});

afterEach(cleanup);

describe('AccountForm', () => {
  it('signed out: warns about missing accounts and disables the picker', () => {
    renderForm(null);
    expect(screen.queryByText('没有可用的账户')).not.toBeNull();
    expect(screen.queryByText('未登录')).not.toBeNull();
    expect(accountSelect().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /退出登录/ })).toBeNull();
  });

  it('signed in: lists the linked accounts and saves the chosen one', async () => {
    renderForm(signedIn(['Alpha', 'Beta']), { account: 'Alpha', pd2Token: 't' });
    expect(screen.queryByText('已登录：Doreet')).not.toBeNull();
    expect(screen.queryByText(/已关联 2 个游戏账户/)).not.toBeNull();
    await waitFor(() => expect(screen.queryByText('没有可用的账户')).toBeNull());
    expect(accountSelect().value).toBe('Alpha');

    fireEvent.change(accountSelect(), { target: { value: 'Beta' } });
    expect(store.updateSettings).toHaveBeenCalledWith({ account: 'Beta' });
  });

  it('shows the count for one account and handles a missing username', () => {
    renderForm(signedIn(['Solo'], null));
    expect(screen.queryByText(/已关联 1 个游戏账户/)).not.toBeNull();
    expect(screen.queryByText('已登录')).not.toBeNull();
  });

  it('shows the login progress and recovers when the OAuth flow fails', async () => {
    const { promise, reject: fail } = Promise.withResolvers<string>();
    startOAuthFlow.mockReturnValue(promise);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderForm(null);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /登录/ })));
    const button = screen.getByRole('button', { name: /正在登录/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await act(async () => fail(new Error('closed')));
    expect((screen.getByRole('button', { name: /^登录$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(startOAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('shows the logout progress until logout settles', async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    logout.mockReturnValue(promise);
    renderForm(signedIn(['Alpha']));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /退出登录/ })));
    expect((screen.getByRole('button', { name: /正在退出/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve());
    expect(screen.queryByRole('button', { name: /正在退出/ })).toBeNull();
  });

  it('hides the manual token field inside the desktop app', () => {
    renderForm(null);
    expect(screen.queryByPlaceholderText('输入 PD2 令牌')).toBeNull();
  });

  it('browser mode: saves a pasted token together with the current account', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    renderForm(null, { account: 'Alpha', pd2Token: '' });
    fireEvent.change(screen.getByPlaceholderText('输入 PD2 令牌'), { target: { value: 'abc' } });
    expect(store.updateSettings).toHaveBeenLastCalledWith({ account: 'Alpha', pd2Token: 'abc' });
  });

  it('does not save when settings change externally', () => {
    renderForm(signedIn(['Alpha', 'Beta']), { account: 'Alpha', pd2Token: 't' });
    act(() => store.replace({ account: 'Beta', pd2Token: 't2' }));
    expect(accountSelect().value).toBe('Beta');
    expect(store.updateSettings).not.toHaveBeenCalled();
  });
});
