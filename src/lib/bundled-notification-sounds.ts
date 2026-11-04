import interfaceBack from '@/assets/notification-sounds/mixkit-software-interface-back-2575.wav';
import positiveNotification from '@/assets/notification-sounds/mixkit-positive-notification-951.wav';
import action from '@/assets/notification-sounds/action-sound.mp3';
import onScreenPrompt from '@/assets/notification-sounds/on-screen-prompt.mp3';
import inGameChoice from '@/assets/notification-sounds/choice-sound-in-game.mp3';

export const DEFAULT_NOTIFICATION_SOUND_SELECTION = 'preset:action';
export const DEFAULT_NOTIFICATION_SOUND_SOURCE = action;

/** Stable ids are persisted separately for chat and market alerts. */
export const NOTIFICATION_SOUND_PRESETS = [
  { id: 'interface-back', name: '音效 1', source: interfaceBack },
  { id: 'positive-notification', name: '音效 2', source: positiveNotification },
  { id: 'action', name: '音效 3', source: action },
  { id: 'on-screen-prompt', name: '音效 4', source: onScreenPrompt },
  { id: 'in-game-choice', name: '音效 5', source: inGameChoice },
] as const;
