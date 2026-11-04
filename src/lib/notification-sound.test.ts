// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/browser-fs', () => ({
  BaseDirectory: { AppConfig: 13 },
  readTextFile: async (path: string) => {
    const value = storage.get(path);
    if (value === undefined) throw new Error('not found');
    return value;
  },
  writeTextFile: async (path: string, value: string) => { storage.set(path, value); },
}));

let played: { src: string; volume: number }[];
beforeEach(() => {
  storage.clear();
  played = [];
  vi.resetModules();
  vi.stubGlobal('Audio', class {
    volume = 1;
    constructor(public src: string) {}
    async play() { played.push({ src: this.src, volume: this.volume }); }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('notification sounds', () => {
  it('uses sound 3 for new chat and market settings and migrates the former default', async () => {
    const { NOTIFICATION_SOUND_PRESETS: presets } = await import('./bundled-notification-sounds');
    const sounds = await import('./notification-sound');
    expect((await sounds.getNotificationSoundSettings('chat')).selected).toBe('preset:action');
    expect((await sounds.getNotificationSoundSettings('market')).selected).toBe('preset:action');
    await sounds.playNotificationSound(70, 'chat');
    await sounds.playNotificationSound(50, 'market');
    expect(played).toEqual([
      { src: presets[2].source, volume: 0.7 },
      { src: presets[2].source, volume: 0.5 },
    ]);

    storage.set('notification-sound-chat.json', JSON.stringify({
      selected: 'default', custom: { name: 'old.mp3', dataUrl: 'data:audio/mpeg;base64,b2xk' },
    }));
    vi.resetModules();
    const restarted = await import('./notification-sound');
    expect(await restarted.getNotificationSoundSettings('chat')).toEqual({
      selected: 'preset:action', custom: { name: 'old.mp3', dataUrl: 'data:audio/mpeg;base64,b2xk' },
    });
    await expect(restarted.selectNotificationSound('chat', 'default')).rejects.toThrow();
  });

  it('persists independent choices from the five bundled sounds and uses them after restart', async () => {
    const sounds = await import('./notification-sound');
    const { NOTIFICATION_SOUND_PRESETS: presets } = await import('./bundled-notification-sounds');
    expect(presets).toHaveLength(5);
    expect(presets.map((preset) => preset.name)).toEqual(['音效 1', '音效 2', '音效 3', '音效 4', '音效 5']);
    await sounds.selectNotificationSound('chat', `preset:${presets[0].id}`);
    await sounds.selectNotificationSound('market', `preset:${presets[4].id}`);

    vi.resetModules();
    const restarted = await import('./notification-sound');
    expect((await restarted.getNotificationSoundSettings('chat')).selected).toBe(`preset:${presets[0].id}`);
    expect((await restarted.getNotificationSoundSettings('market')).selected).toBe(`preset:${presets[4].id}`);
    await restarted.playNotificationSound(30, 'chat');
    await restarted.playNotificationSound(60, 'market');
    expect(played).toEqual([
      { src: presets[0].source, volume: 0.3 },
      { src: presets[4].source, volume: 0.6 },
    ]);
  });

  it('uses sound 3 for other notifications independently of the selected chat sound', async () => {
    const sounds = await import('./notification-sound');
    const { NOTIFICATION_SOUND_PRESETS: presets } = await import('./bundled-notification-sounds');
    await sounds.selectNotificationSound('chat', 'preset:interface-back');
    await sounds.playNotificationSound(55, 'other');
    expect(played).toEqual([{ src: presets[2].source, volume: 0.55 }]);
  });

  it('keeps chat and market sounds separate, including after restarting', async () => {
    const sounds = await import('./notification-sound');
    await sounds.saveCustomNotificationSound('chat', new File(['chat'], 'chat.mp3', { type: 'audio/mpeg' }));
    await sounds.saveCustomNotificationSound('market', new File(['market'], 'market.wav', { type: 'audio/wav' }));
    await sounds.playNotificationSound(25);
    await sounds.playNotificationSound(80, 'market');
    expect(played).toEqual([
      { src: 'data:audio/mpeg;base64,Y2hhdA==', volume: 0.25 },
      { src: 'data:audio/wav;base64,bWFya2V0', volume: 0.8 },
    ]);

    vi.resetModules();
    const restarted = await import('./notification-sound');
    expect((await restarted.getCustomNotificationSound('chat'))?.name).toBe('chat.mp3');
    expect((await restarted.getCustomNotificationSound('market'))?.name).toBe('market.wav');
    await restarted.saveCustomNotificationSound('market', null);
    await restarted.playNotificationSound(50, 'market');
    const { NOTIFICATION_SOUND_PRESETS: presets } = await import('./bundled-notification-sounds');
    expect(played.at(-1)).toEqual({ src: presets[2].source, volume: 0.5 });
    expect((await restarted.getCustomNotificationSound('chat'))?.name).toBe('chat.mp3');
  });

  it('rejects empty, oversized and unsupported files without replacing the saved sound', async () => {
    const sounds = await import('./notification-sound');
    await sounds.saveCustomNotificationSound('chat', new File(['old'], 'old.ogg'));
    await expect(sounds.saveCustomNotificationSound('chat', new File([], 'empty.mp3'))).rejects.toThrow('不超过 2 MB');
    await expect(sounds.saveCustomNotificationSound('chat', new File(['x'], 'not-a-sound.txt'))).rejects.toThrow('MP3');
    const oversized = new File([new Uint8Array(sounds.MAX_NOTIFICATION_SOUND_BYTES + 1)], 'large.wav');
    await expect(sounds.saveCustomNotificationSound('chat', oversized)).rejects.toThrow('不超过 2 MB');
    expect((await sounds.getCustomNotificationSound('chat'))?.name).toBe('old.ogg');
  });

  it('uses the built-in sound when a saved file is corrupt or custom playback fails', async () => {
    storage.set('notification-sound-chat.json', '{broken');
    const sounds = await import('./notification-sound');
    const { NOTIFICATION_SOUND_PRESETS: presets } = await import('./bundled-notification-sounds');
    await sounds.playNotificationSound(70);
    expect(played).toEqual([{ src: presets[2].source, volume: 0.7 }]);
    await sounds.saveCustomNotificationSound('chat', new File(['bad audio'], 'bad.mp3'));
    vi.stubGlobal('Audio', class {
      volume = 1;
      constructor(public src: string) {}
      async play() {
        if (this.src !== presets[2].source) throw new Error('unsupported audio');
        played.push({ src: this.src, volume: this.volume });
      }
    });
    await sounds.playNotificationSound(60);
    expect(played.at(-1)).toEqual({ src: presets[2].source, volume: 0.6 });
  });
});
