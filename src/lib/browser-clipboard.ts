/**
 * Browser-compatible clipboard utilities
 * Uses Tauri API in Tauri environment, falls back to browser Clipboard API
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { readText as tauriReadText, writeText as tauriWriteText } from '@tauri-apps/plugin-clipboard-manager';

/** Game items only: try the game's original UTF-8 CF_TEXT before Windows' ANSI conversion. */
export async function readGameItemText(): Promise<string | null> {
  if (isTauri()) {
    try {
      const original = await invoke<string | null>('read_game_item_clipboard');
      if (original !== null) return original;
    } catch (error) {
      console.warn('Failed to read original game item text:', error);
    }
  }
  return readText();
}

/**
 * Read text from clipboard
 */
export async function readText(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await tauriReadText();
    } catch (error) {
      console.warn('Failed to read clipboard:', error);
      return null;
    }
  }

  // Browser fallback: use Clipboard API
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
    return null;
  } catch (error) {
    console.warn('Failed to read clipboard:', error);
    return null;
  }
}

/**
 * Write text to clipboard
 */
export async function writeText(text: string): Promise<void> {
  if (isTauri()) {
    try {
      await tauriWriteText(text);
      return;
    } catch (error) {
      console.error('Failed to write to clipboard:', error);
      throw error;
    }
  }

  // Browser fallback: use Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    throw new Error('Clipboard API not available');
  }
}
