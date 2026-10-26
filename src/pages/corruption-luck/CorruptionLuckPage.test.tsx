// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CorruptionLuckPage from './CorruptionLuckPage';
import { LUCK_TIERS, luckResult, rollLuck } from './luck';

const panel = vi.hoisted(() => ({ close: vi.fn(), visible: true }));
vi.mock('@/overlay', () => ({ usePanel: () => panel }));

const sounds: FakeAudio[] = [];
let playbackResult: () => Promise<void>;
class FakeAudio {
  volume = 1;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => playbackResult());
  pause = vi.fn();
  constructor(public src: string) { sounds.push(this); }
}

beforeEach(() => {
  panel.visible = true;
  sounds.length = 0;
  playbackResult = () => Promise.resolve();
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  panel.close.mockClear();
});

describe('corruption luck', () => {
  it.each([
    [20, '0-20'], [40, '21-40'], [60, '41-60'], [80, '61-80'],
    [90, '81-90'], [95, '91-95'], [100, '96-100'],
  ])('plays the user-selected %s sound for score %i', (score, filename) => {
    render(<CorruptionLuckPage />);
    expect(sounds).toHaveLength(0);
    vi.spyOn(Math, 'random').mockReturnValue((score + .5) / 101);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    expect(sounds).toHaveLength(1);
    expect(sounds[0].src).toContain(`/${filename}.flac`);
    expect(sounds[0].play).toHaveBeenCalledOnce();
    expect(sounds[0].volume).toBe(.5);
  });

  it('stops the previous sound before starting another, and stops on close', () => {
    render(<CorruptionLuckPage />);
    const button = screen.getByRole('button', { name: '试试手气' });
    fireEvent.click(button);
    sounds[0].currentTime = 1.2;
    fireEvent.click(button);
    expect(sounds[0].pause).toHaveBeenCalledOnce();
    expect(sounds[0].currentTime).toBe(0);
    expect(sounds[0].pause.mock.invocationCallOrder[0]).toBeLessThan(sounds[1].play.mock.invocationCallOrder[0]);
    fireEvent.click(screen.getByRole('button', { name: '关闭试手气' }));
    expect(sounds[1].pause).toHaveBeenCalledOnce();
    expect(panel.close).toHaveBeenCalledOnce();
  });

  it('stops on hiding and unmounting, without replaying when shown again', () => {
    const { rerender, unmount } = render(<CorruptionLuckPage />);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    panel.visible = false;
    rerender(<CorruptionLuckPage />);
    expect(sounds[0].pause).toHaveBeenCalledOnce();
    panel.visible = true;
    rerender(<CorruptionLuckPage />);
    expect(sounds).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    unmount();
    expect(sounds[1].pause).toHaveBeenCalledOnce();
  });

  it('stops when the browser tab is hidden', () => {
    render(<CorruptionLuckPage />);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(sounds[0].pause).toHaveBeenCalledOnce();
  });

  it('keeps the result after a playback failure and can retry on the next draw', async () => {
    playbackResult = () => Promise.reject(new Error('Unsupported audio'));
    render(<CorruptionLuckPage />);
    vi.spyOn(Math, 'random').mockReturnValue(.9999);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '试试手气' })));
    expect(screen.getByText('音效暂时无法播放，手气结果不受影响。')).not.toBeNull();
    expect(screen.getByText('瓦圣！赶快开瓦！快！')).not.toBeNull();
    playbackResult = () => Promise.resolve();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '试试手气' })));
    expect(screen.queryByText('音效暂时无法播放，手气结果不受影响。')).toBeNull();
  });

  it('ignores a late failure from a sound that was replaced', async () => {
    let rejectPrevious: (reason: Error) => void = () => {};
    playbackResult = () => new Promise((_, reject) => { rejectPrevious = reject; });
    render(<CorruptionLuckPage />);
    const button = screen.getByRole('button', { name: '试试手气' });
    fireEvent.click(button);
    playbackResult = () => Promise.resolve();
    fireEvent.click(button);
    await act(async () => rejectPrevious(new Error('Old playback aborted')));
    expect(screen.queryByText('音效暂时无法播放，手气结果不受影响。')).toBeNull();
    expect(sounds[1].pause).not.toHaveBeenCalled();
  });

  it.each([
    [0, 1, '非酋附体'], [20, 1, '非酋附体'],
    [21, 2, '手气欠费'], [40, 2, '手气欠费'],
    [41, 3, '五五开'], [60, 3, '五五开'],
    [61, 4, '欧气渐起'], [80, 4, '欧气渐起'],
    [81, 5, '欧皇预备'], [90, 5, '欧皇预备'],
    [91, 6, '天选之手'], [95, 6, '天选之手'],
    [96, 7, '瓦圣降临'], [100, 7, '瓦圣降临'],
  ])('assigns score %i to level %i (%s)', (score, level, label) => {
    expect(luckResult(score)).toMatchObject({ level, label });
  });

  it('covers all 101 scores exactly once, with seven distinct sound slot ids', () => {
    expect(new Set(LUCK_TIERS.map((result) => result.tier)).size).toBe(7);
    for (let score = 0; score <= 100; score++) {
      const matches = LUCK_TIERS.filter((result) => score >= result.min && score <= result.max);
      expect(matches).toHaveLength(1);
      expect(luckResult(score)).toBe(matches[0]);
    }
  });

  it('can roll every integer from 0 to 100, including both endpoints', () => {
    const random = vi.spyOn(Math, 'random');
    for (let score = 0; score <= 100; score++) {
      random.mockReturnValue((score + 0.5) / 101);
      expect(rollLuck()).toBe(score);
    }
    random.mockReturnValue(0);
    expect(rollLuck()).toBe(0);
    random.mockReturnValue(1 - Number.EPSILON);
    expect(rollLuck()).toBe(100);
  });

  it('places the parcel, rolls on each click and closes from either close button', () => {
    render(<CorruptionLuckPage />);
    expect(screen.getByLabelText('神秘包裹，占 2×2 格')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('神秘包裹已就位');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    expect(screen.getByRole('status').textContent).toContain('0');
    expect(screen.getByRole('status').textContent).toContain('先洗洗手，石头都摇头');
    random.mockReturnValue(0.9999);
    fireEvent.click(screen.getByRole('button', { name: '试试手气' }));
    expect(screen.getByRole('status').textContent).toContain('100');
    expect(screen.getByRole('status').textContent).toContain('瓦圣！');
    expect(random).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '关闭试手气' }));
    fireEvent.click(screen.getByRole('button', { name: /^关闭$/ }));
    expect(panel.close).toHaveBeenCalledTimes(2);
  });
});
