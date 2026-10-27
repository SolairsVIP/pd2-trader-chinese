import { describe, expect, it } from 'vitest';
import { buildGameWhisper, gameAccount } from './game-account';

describe('game whisper targets', () => {
  it('copies an accepted-offer message to the account after the separator', () => {
    expect(buildGameWhisper('Moe_DrDru*rocad2', 'Your offer has been accepted. Game: sol15////1')).toBe(
      '/w *rocad2 Your offer has been accepted. Game: sol15////1',
    );
  });
  it('handles plain and starred accounts and rejects malformed targets', () => {
    expect(gameAccount('Alice')).toBe('Alice');
    expect(gameAccount('*Alice')).toBe('Alice');
    expect(buildGameWhisper('a*b*c', 'hi')).toBeUndefined();
    expect(buildGameWhisper('name*', 'hi')).toBeUndefined();
  });
});
