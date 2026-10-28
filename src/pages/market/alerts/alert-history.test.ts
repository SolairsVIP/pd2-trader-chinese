import { describe, expect, it } from 'vitest';
import { mergeAlertHistory, rememberLiveAlerts, liveAlertHistory, unexpiredAlerts } from './alert-history';
import type { MarketAlert } from './saved-search-api';
const item = (id: string, matchedAt: string) => ({ id, matchedAt, listingId: id, savedSearchId: 's', savedSearchName: '测试', listing: {} }) as MarketAlert;
describe('alert history', () => {
  it('isolates the in-memory live history by account and preserves events for a later-opened panel', () => {
    const fresh = item('live', new Date().toISOString());
    rememberLiveAlerts('account-a', [fresh]);
    expect(liveAlertHistory('account-a')).toEqual([fresh]);
    expect(liveAlertHistory('account-b')).toEqual([]);
  });
  it('removes each record after 30 minutes', () => {
    const now = Date.parse('2026-10-28T04:00:00Z');
    expect(unexpiredAlerts([item('expired', '2026-10-28T03:30:00Z'), item('fresh', '2026-10-28T03:30:01Z')], now).map(a => a.id)).toEqual(['fresh']);
  });
  it('merges live alerts with server history by id, newest first', () => {
    const older = item('a', '2026-10-28T01:00:00Z');
    const newer = item('b', '2026-10-28T02:00:00Z');
    expect(mergeAlertHistory([newer], [older, newer])).toEqual([newer, older]);
  });
});
