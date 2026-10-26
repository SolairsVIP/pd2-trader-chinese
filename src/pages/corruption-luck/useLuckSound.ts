import { useCallback, useEffect, useRef, useState } from 'react';
import poor from '@/assets/corruption-luck/sounds/0-20.flac';
import unlucky from '@/assets/corruption-luck/sounds/21-40.flac';
import balanced from '@/assets/corruption-luck/sounds/41-60.flac';
import hopeful from '@/assets/corruption-luck/sounds/61-80.flac';
import steady from '@/assets/corruption-luck/sounds/81-90.flac';
import chosen from '@/assets/corruption-luck/sounds/91-95.flac';
import saint from '@/assets/corruption-luck/sounds/96-100.flac';
import { luckResult, type LuckTier } from './luck';

const LUCK_SOUNDS: Record<LuckTier, string> = { poor, unlucky, balanced, hopeful, steady, chosen, saint };

export function useLuckSound(visible: boolean) {
  const active = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState(false);

  const stop = useCallback(() => {
    const audio = active.current;
    active.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  // Called directly by the draw button so playback remains inside the user's click gesture.
  const play = useCallback((score: number) => {
    stop();
    setError(false);
    const audio = new Audio(LUCK_SOUNDS[luckResult(score).tier]);
    audio.volume = 0.5;
    active.current = audio;
    const failed = () => {
      if (active.current === audio) {
        stop();
        setError(true);
      }
    };
    audio.onerror = failed;
    audio.onended = () => {
      if (active.current === audio) stop();
    };
    audio.play().catch(failed);
  }, [stop]);

  useEffect(() => {
    if (!visible) stop();
  }, [visible, stop]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [stop]);

  return { play, stop, error };
}
