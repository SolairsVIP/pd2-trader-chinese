import { describe, expect, it } from 'vitest';
import { localizePd2Text } from './localize-pd2-text';
import { PD2_SKILL_TRANSLATIONS } from './pd2-skill-translations';

describe('all bundled skill-name translations', () => {
  it.each(Object.entries(PD2_SKILL_TRANSLATIONS))('%s displays as %s', (english, chinese) => {
    expect(localizePd2Text(english)).toBe(chinese);
  });
});

describe('localizePd2Text optional display text', () => {
  it('translates the remaining ethereal and deadly-strike labels in the user screenshot', () => {
    expect(localizePd2Text('Ethereal')).toBe('无形');
    expect(localizePd2Text('20% Chance of Deadly Strike')).toBe('20% 致命打击几率');
  });
  it.each([undefined, null, ''])('renders an absent or empty label (%s) as empty text', (text) => {
    expect(localizePd2Text(text)).toBe('');
  });

  it('still translates stat labels and retains their value placeholders', () => {
    expect(localizePd2Text('% Faster Cast Rate')).toBe('% 快速施法率');
  });

  it('translates full resistance names without leaving English suffixes', () => {
    expect(localizePd2Text('+{X}% Total Fire Resistance')).toBe('+{X}% 总火焰抗性');
    expect(localizePd2Text('+{X}% Total Cold Resistance')).toBe('+{X}% 总冰冷抗性');
    expect(localizePd2Text('+{X}% Total Resistances (sum of all elements)')).toBe('+{X}% 总抗性 (各元素之和)');
    expect(localizePd2Text('Fire Resist')).toBe('火焰抗性');
  });

  it('preserves unrecognized server explanations', () => {
    expect(localizePd2Text('unparsed stats: 2')).toBe('unparsed stats: 2');
  });
});
