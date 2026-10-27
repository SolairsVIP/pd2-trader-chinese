// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { PANEL_DEFS } from './registry';
import { isPanelVisible, type PanelState } from './OverlayProvider';

const open = { open: true, placing: false } as PanelState;

describe('PANEL_DEFS', () => {
  it('centers sign-in in the game and keeps browser OAuth alive outside the game', () => {
    expect(PANEL_DEFS.signIn).toMatchObject({ placement: 'gameCenter', keepMounted: false, hideOnGameBlur: false });
    expect(PANEL_DEFS.signIn.closeOnBlur).toBe(true);
  });
  it('keeps the corruption experiment bounded, without keyboard capture, and closes on leaving it', () => {
    expect(PANEL_DEFS.corruptionLuck).toMatchObject({
      size: { width: 424, height: 700 },
      placement: 'gameCenter', keyboard: 'never',
      hideOnGameBlur: true, closeOnBlur: true,
      keepMounted: false, resizable: false,
    });
    expect(isPanelVisible(PANEL_DEFS.corruptionLuck, open, false)).toBe(false);
    expect(isPanelVisible(PANEL_DEFS.corruptionLuck, open, true)).toBe(true);
  });
  it('keeps the corrupted-zone notice small, keyboard-free and hidden outside the game', () => {
    expect(PANEL_DEFS.corruptedZone).toMatchObject({
      size: { width: 720, height: 48 },
      keyboard: 'never',
      hideOnGameBlur: true,
      resizable: false,
      persist: false,
    });
    expect(isPanelVisible(PANEL_DEFS.corruptedZone, open, false)).toBe(false);
    expect(isPanelVisible(PANEL_DEFS.corruptedZone, open, true)).toBe(true);
    expect(isPanelVisible(PANEL_DEFS.corruptedZone, { ...open, open: false }, true)).toBe(false);
  });
  it.each([
    ['Settings', 'settings'],
    ["What's New", 'changeLog'],
  ] as const)('shows %s outside the game, and closes it when the user leaves it', (_name, id) => {
    expect(isPanelVisible(PANEL_DEFS[id], open, false)).toBe(true);
    expect(PANEL_DEFS[id].closeOnBlur).toBe(true);
  });

  it('opens the market browser large in the screen center, resizable, remembered and kept mounted', () => {
    expect(PANEL_DEFS.market).toMatchObject({
      size: { width: 1400, height: 860 },
      resizable: true,
      placement: 'screenCenter',
      persist: true,
      keepMounted: true,
      hideOnGameBlur: true,
      closeOnBlur: true,
    });
  });
});
