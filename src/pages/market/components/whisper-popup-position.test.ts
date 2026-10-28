import { describe, expect, it } from 'vitest';
import { positionWhisperPopup } from './whisper-popup-position';

describe('whisper popup positioning', () => {
  const bounds = { left: 100, top: 100, right: 900, bottom: 700 };
  const size = { width: 256, height: 120 };
  it('places the popup beside the pointer', () => {
    expect(positionWhisperPopup({ x: 300, y: 250 }, size, bounds)).toEqual({ left: 312, top: 262 });
  });
  it('flips to the other side near the right and bottom edges', () => {
    expect(positionWhisperPopup({ x: 890, y: 690 }, size, bounds)).toEqual({ left: 622, top: 558 });
  });
  it('keeps a large popup inside narrow bounds', () => {
    expect(positionWhisperPopup({ x: 105, y: 105 }, size, { left: 100, top: 100, right: 300, bottom: 200 })).toEqual({ left: 100, top: 100 });
  });
});
