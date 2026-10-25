import { describe, expect, it } from 'vitest';
import { describeUiError } from './ui-error';

describe('Chinese error presentation', () => {
  it.each([
    ['API Error: 401 Unauthorized', '登录已失效'],
    ['API Error: 403 Forbidden', '权限'],
    ['API Error: 404 Not Found', '未找到'],
    ['API Error: 409 Conflict', '状态已发生变化'],
    ['API Error: 429 Too Many Requests', '请求过于频繁'],
    ['Rare appraisal API error: 503', '服务器暂时无法处理'],
    ['TypeError: Failed to fetch', '网络连接失败'],
    ['Request timed out', '请求超时'],
    ['No auth token available', '尚未登录'],
    ['Could not find or create chat log file. Please check your Diablo II Directory settings.', '聊天日志文件'],
  ])('presents %s in Chinese', (message, expected) => {
    expect(describeUiError(new Error(message))).toContain(expected);
  });
  it('preserves meaningful Chinese errors and distinguishes account mismatch from 404', () => {
    expect(describeUiError(new Error('无法识别装备底材“未知”。'))).toBe('无法识别装备底材“未知”。');
    expect(describeUiError({ name: 'AccountMismatchError', statusCode: 404, message: 'Wrong account' })).toContain('账号');
    expect(describeUiError({ status: 429, message: 'backend diagnostic' })).toContain('请求过于频繁');
  });
  it('keeps unknown backend details out of the primary UI message without modifying the error', () => {
    const original = new Error('Internal diagnostic');
    expect(describeUiError(original, '加载挂单失败，请稍后重试。')).toBe('加载挂单失败，请稍后重试。');
    expect(original.message).toBe('Internal diagnostic');
  });
});
