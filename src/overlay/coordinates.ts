import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** The webview uses work-area coordinates even when its native host is cropped around a small panel. */
export async function overlayScreenOrigin(): Promise<{ x: number; y: number }> {
  const viewport = await invoke<{ x: number; y: number } | null>('get_overlay_viewport');
  if (viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y)) return viewport;
  return getCurrentWindow().outerPosition();
}
