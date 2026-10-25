import { invoke, isTauri } from '@tauri-apps/api/core';

/** No clipboard, account data or message contents are included in the activation trace. */
export function traceActivation(
  stage: 'focusReceived' | 'focusCommitted' | 'shortcutsReady' | 'shortcutPressed',
  focused: boolean,
  count = 0,
) {
  if (isTauri()) void Promise.resolve(invoke('report_overlay_health', { stage, focused, count })).catch(() => {});
}
