import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { overlayScreenOrigin } from './coordinates';

const outerPosition = vi.hoisted(() => vi.fn(async () => ({ x: 1800, y: 800 })));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ outerPosition }) }));

beforeEach(() => vi.clearAllMocks());

describe('small-window canvas coordinates', () => {
  it('uses the work-area origin rather than the cropped dock window position', async () => {
    vi.mocked(invoke).mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(await overlayScreenOrigin()).toMatchObject({ x: 0, y: 0 });
    expect(outerPosition).not.toHaveBeenCalled();
  });

  it('preserves negative origins for monitors left of the primary display', async () => {
    vi.mocked(invoke).mockResolvedValue({ x: -2560, y: 0, width: 2560, height: 1440 });
    expect(await overlayScreenOrigin()).toMatchObject({ x: -2560, y: 0 });
  });

  it('falls back to the native origin when no virtual work area is provided', async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    expect(await overlayScreenOrigin()).toEqual({ x: 1800, y: 800 });
  });
});
