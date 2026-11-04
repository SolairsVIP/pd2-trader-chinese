import { BaseDirectory, readTextFile, writeTextFile } from '@/lib/browser-fs';
import {
  DEFAULT_NOTIFICATION_SOUND_SELECTION, DEFAULT_NOTIFICATION_SOUND_SOURCE, NOTIFICATION_SOUND_PRESETS,
} from '@/lib/bundled-notification-sounds';

export type NotificationSoundKind = 'chat' | 'market';
export interface CustomNotificationSound {
  name: string;
  dataUrl: string;
}
export interface NotificationSoundSettings {
  selected: string;
  custom: CustomNotificationSound | null;
}

export const MAX_NOTIFICATION_SOUND_BYTES = 2 * 1024 * 1024;
const SOUND_FILES: Record<NotificationSoundKind, string> = {
  chat: 'notification-sound-chat.json',
  market: 'notification-sound-market.json',
};
const MIME_TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
const cache = new Map<NotificationSoundKind, Promise<NotificationSoundSettings>>();

function validCustomSound(value: unknown): CustomNotificationSound | null {
  if (!value || typeof value !== 'object') return null;
  const { name, dataUrl } = value as Partial<CustomNotificationSound>;
  if (typeof name !== 'string' || typeof dataUrl !== 'string' ||
      !/^data:audio\/(mpeg|wav|ogg);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) return null;
  return { name, dataUrl };
}

function validSelection(selected: string, custom: CustomNotificationSound | null): boolean {
  return (selected === 'custom' && !!custom) ||
    NOTIFICATION_SOUND_PRESETS.some((preset) => selected === `preset:${preset.id}`);
}

/** Audio is stored separately from settings so changing a slider does not rewrite the sound file. */
export function getNotificationSoundSettings(kind: NotificationSoundKind): Promise<NotificationSoundSettings> {
  let loading = cache.get(kind);
  if (!loading) {
    loading = Promise.resolve()
      .then(() => readTextFile(SOUND_FILES[kind], { baseDir: BaseDirectory.AppConfig }))
      .then((text) => {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== 'object') return { selected: DEFAULT_NOTIFICATION_SOUND_SELECTION, custom: null };
        // Also accepts an imported sound saved before preset selection was introduced.
        const oldCustom = validCustomSound(value);
        if (oldCustom) return { selected: 'custom', custom: oldCustom };
        const stored = value as Partial<NotificationSoundSettings>;
        const custom = validCustomSound(stored.custom);
        const selected = typeof stored.selected === 'string' && validSelection(stored.selected, custom)
          ? stored.selected : DEFAULT_NOTIFICATION_SOUND_SELECTION;
        return { selected, custom };
      })
      .catch(() => ({ selected: DEFAULT_NOTIFICATION_SOUND_SELECTION, custom: null }));
    cache.set(kind, loading);
  }
  return loading;
}

export async function getCustomNotificationSound(kind: NotificationSoundKind): Promise<CustomNotificationSound | null> {
  return (await getNotificationSoundSettings(kind)).custom;
}

async function persistSoundSettings(kind: NotificationSoundKind, settings: NotificationSoundSettings): Promise<void> {
  await writeTextFile(SOUND_FILES[kind], JSON.stringify(settings), { baseDir: BaseDirectory.AppConfig });
  cache.set(kind, Promise.resolve(settings));
}

export async function selectNotificationSound(kind: NotificationSoundKind, selected: string): Promise<NotificationSoundSettings> {
  const current = await getNotificationSoundSettings(kind);
  if (!validSelection(selected, current.custom)) throw new Error('找不到所选音效，请重新选择。');
  const settings = { ...current, selected };
  await persistSoundSettings(kind, settings);
  return settings;
}

function readAudioFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取音频文件。'));
    reader.onabort = () => reject(new Error('读取音频文件已取消。'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('无法读取音频文件。'));
    reader.readAsDataURL(file);
  });
}

/** Passing null restores the built-in sound. A copy is saved, so moving the original file is safe. */
export async function saveCustomNotificationSound(
  kind: NotificationSoundKind,
  file: File | null,
): Promise<CustomNotificationSound | null> {
  let sound: CustomNotificationSound | null = null;
  if (file) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_TYPES[extension];
    if (!mime) throw new Error('请选择 MP3、WAV 或 OGG 音频文件。');
    if (!file.size || file.size > MAX_NOTIFICATION_SOUND_BYTES) throw new Error('音频文件需大于 0 且不超过 2 MB。');
    const encoded = await readAudioFile(file);
    const base64 = encoded.split(',')[1];
    if (!base64) throw new Error('无法读取音频文件。');
    sound = { name: file.name, dataUrl: `data:${mime};base64,${base64}` };
  }
  const current = await getNotificationSoundSettings(kind);
  await persistSoundSettings(kind, {
    selected: sound ? 'custom' : DEFAULT_NOTIFICATION_SOUND_SELECTION,
    custom: sound ?? current.custom,
  });
  return sound;
}

export async function getNotificationSoundSource(kind: NotificationSoundKind): Promise<string> {
  const { selected, custom } = await getNotificationSoundSettings(kind);
  if (selected === 'custom') return custom?.dataUrl ?? DEFAULT_NOTIFICATION_SOUND_SOURCE;
  return NOTIFICATION_SOUND_PRESETS.find((preset) => selected === `preset:${preset.id}`)?.source ?? DEFAULT_NOTIFICATION_SOUND_SOURCE;
}

export function notificationVolume(volume: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 70)) / 100;
}

/** Both website/game messages use the chat sound; market alerts use their independent sound. */
export async function playNotificationSound(volume = 70, kind: NotificationSoundKind | 'other' = 'chat'): Promise<void> {
  const fallbackSource = DEFAULT_NOTIFICATION_SOUND_SOURCE;
  const source = kind === 'other' ? fallbackSource : await getNotificationSoundSource(kind);
  try {
    const audio = new Audio(source);
    audio.volume = notificationVolume(volume);
    await audio.play();
  } catch (error) {
    if (source !== fallbackSource) {
      try {
        const fallback = new Audio(fallbackSource);
        fallback.volume = notificationVolume(volume);
        await fallback.play();
        return;
      } catch {
        // Report the original failure below.
      }
    }
    console.error('Failed to play notification sound:', error);
  }
}
