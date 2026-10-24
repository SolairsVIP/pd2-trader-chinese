import { describe, expect, it } from 'vitest';
import { localizePd2Text } from './localize-pd2-text';
import { PD2_SKILL_TRANSLATIONS } from './pd2-skill-translations';

describe('all bundled skill-name translations', () => {
  it.each(Object.entries(PD2_SKILL_TRANSLATIONS))('%s displays as %s', (english, chinese) => {
    expect(localizePd2Text(english)).toBe(chinese);
  });
});

describe('localizePd2Text optional display text', () => {
  it.each([undefined, null, ''])('renders an absent or empty label (%s) as empty text', (text) => {
    expect(localizePd2Text(text)).toBe('');
  });

  it('still translates stat labels and retains their value placeholders', () => {
    expect(localizePd2Text('% Faster Cast Rate')).toBe('% 快速施法率');
  });

  it('preserves unrecognized server explanations', () => {
    expect(localizePd2Text('unparsed stats: 2')).toBe('unparsed stats: 2');
  });
});
