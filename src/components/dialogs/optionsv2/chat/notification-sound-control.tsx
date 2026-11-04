import * as React from 'react';
import { RotateCcw, Upload, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUiText } from '@/lib/ui-language';
import { DEFAULT_NOTIFICATION_SOUND_SELECTION, NOTIFICATION_SOUND_PRESETS } from '@/lib/bundled-notification-sounds';
import {
  getNotificationSoundSettings, getNotificationSoundSource, notificationVolume, saveCustomNotificationSound,
  selectNotificationSound, type NotificationSoundSettings, type NotificationSoundKind,
} from '@/lib/notification-sound';

/** Reuse a playing sample while a slider moves, so adjusting volume does not stack audio clips. */
export function useNotificationSoundPreview() {
  const active = React.useRef<{ kind: NotificationSoundKind; audio: HTMLAudioElement } | null>(null);
  const sequence = React.useRef(0);
  const [errorKind, setErrorKind] = React.useState<NotificationSoundKind | null>(null);
  const [playingKind, setPlayingKind] = React.useState<NotificationSoundKind | null>(null);

  const stop = React.useCallback(() => {
    sequence.current += 1;
    active.current?.audio.pause();
    active.current = null;
    setPlayingKind(null);
  }, []);
  React.useEffect(() => () => {
    sequence.current += 1;
    active.current?.audio.pause();
    active.current = null;
  }, []);

  const preview = React.useCallback(async (kind: NotificationSoundKind, volume: number, restart = false) => {
    const current = active.current;
    if (!restart && current?.kind === kind && !current.audio.paused && !current.audio.ended) {
      current.audio.volume = notificationVolume(volume);
      return;
    }
    stop();
    const request = sequence.current;
    const source = await getNotificationSoundSource(kind);
    if (request !== sequence.current) return;
    try {
      const audio = new Audio(source);
      audio.volume = notificationVolume(volume);
      active.current = { kind, audio };
      audio.onended = () => {
        if (active.current?.audio === audio) {
          active.current = null;
          setPlayingKind(null);
        }
      };
      setPlayingKind(kind);
      setErrorKind(null);
      await audio.play();
    } catch {
      if (request === sequence.current) {
        active.current = null;
        setPlayingKind(null);
        setErrorKind(kind);
      }
    }
  }, [stop]);

  return { preview, stop, playingKind, errorKind };
}

interface SoundFileControlProps {
  kind: NotificationSoundKind;
  volume: number;
  preview: (kind: NotificationSoundKind, volume: number, restart?: boolean) => Promise<void>;
  previewError: boolean;
  stop: () => void;
  playing: boolean;
}

export function SoundFileControl({ kind, volume, preview, previewError, stop, playing }: SoundFileControlProps) {
  const __ui = useUiText();
  const name = kind === 'chat' ? __ui('聊天提示音') : __ui('市场提醒音效');
  const input = React.useRef<HTMLInputElement>(null);
  const generation = React.useRef(0);
  const [sound, setSound] = React.useState<NotificationSoundSettings>({ selected: DEFAULT_NOTIFICATION_SOUND_SELECTION, custom: null });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const request = ++generation.current;
    void getNotificationSoundSettings(kind).then((saved) => {
      if ((saved.selected !== DEFAULT_NOTIFICATION_SOUND_SELECTION || saved.custom) && generation.current === request) setSound(saved);
    });
    return () => { generation.current += 1; };
  }, [kind]);

  const choose = async (file: File | null) => {
    const request = ++generation.current;
    setError('');
    setSaving(true);
    try {
      await saveCustomNotificationSound(kind, file);
      const saved = await getNotificationSoundSettings(kind);
      if (generation.current !== request) return;
      setSound(saved);
      void preview(kind, volume, true);
    } catch (cause) {
      if (generation.current === request) {
        setError(cause instanceof Error ? cause.message : __ui('保存音效失败，请重试。'));
      }
    } finally {
      if (generation.current === request) setSaving(false);
    }
  };

  const choosePreset = async (selected: string) => {
    const request = ++generation.current;
    setError('');
    setSaving(true);
    try {
      const saved = await selectNotificationSound(kind, selected);
      if (generation.current !== request) return;
      setSound(saved);
      void preview(kind, volume, true);
    } catch (cause) {
      if (generation.current === request) {
        setError(cause instanceof Error ? cause.message : __ui('保存音效失败，请重试。'));
      }
    } finally {
      if (generation.current === request) setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sound.selected}
          onValueChange={(selected) => void choosePreset(selected)}
          disabled={saving}>
          <SelectTrigger aria-label={`${name}${__ui('选项')}`}
            className="w-48 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_SOUND_PRESETS.map((preset) => (
              <SelectItem key={preset.id}
                value={`preset:${preset.id}`}>{__ui(preset.name)}</SelectItem>
            ))}
            {sound.custom && <SelectItem value="custom">{sound.custom.name}</SelectItem>}
          </SelectContent>
        </Select>
        <input
          ref={input}
          type="file"
          accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
          aria-label={`${__ui('选择')}${name}`}
          className="hidden"
          disabled={saving}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void choose(file);
          }}
        />
        <Button type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => input.current?.click()}>
          <Upload aria-hidden />{__ui('选择文件')}
        </Button>
        <Button type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          aria-label={`${__ui(playing ? '停止试听' : '试听')}${name}`}
          onClick={() => playing ? stop() : void preview(kind, volume, true)}>
          <Volume2 aria-hidden />{__ui(playing ? '停止' : '试听')}
        </Button>
        <Button type="button"
          variant="ghost"
          size="sm"
          disabled={saving || sound.selected === DEFAULT_NOTIFICATION_SOUND_SELECTION}
          aria-label={`${__ui('恢复默认')}${name}`}
          onClick={() => void choose(null)}>
          <RotateCcw aria-hidden />{__ui('恢复默认')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{__ui('支持 MP3、WAV、OGG，文件不超过 2 MB。调节音量时可试听。')}</p>
      {(error || previewError) && <p role="alert"
        className="text-xs text-destructive">{error || __ui('无法播放音效，请检查文件或系统声音设置。')}</p>}
    </div>
  );
}
