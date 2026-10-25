/** Chinese presentation only. Never transform API bodies, templates or player messages. */
export function describeUiError(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof record.message === 'string' ? record.message : typeof error === 'string' ? error : '';
  const explicitStatus = record.statusCode ?? record.status;
  const http = message.match(/(?:API(?: error)?|HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})/i);
  const status = typeof explicitStatus === 'number' ? explicitStatus : http ? Number(http[1]) : undefined;
  if (record.name === 'AccountMismatchError') return '所选游戏账号未关联当前登录的网站账号，请检查账号和分区设置。';
  if (status === 401 || record.name === 'AuthenticationError') return '登录已失效，请重新登录后重试。';
  if (status === 403) return '没有执行此操作的权限，请检查账号授权。（HTTP 403）';
  if (status === 404) return '未找到请求的物品或数据，请刷新后重试。（HTTP 404）';
  if (status === 409) return '数据状态已发生变化，请刷新后重试。（HTTP 409）';
  if (status === 429) return '请求过于频繁，请稍后重试。（HTTP 429）';
  if (status && status >= 500) return `服务器暂时无法处理请求，请稍后重试。（HTTP ${status}）`;
  if (/[\u3400-\u9fff]/u.test(message) && !/^API Error:/i.test(message)) return message;
  if (/not authenticated|no auth token|session expired/i.test(message)) return '尚未登录或登录已失效，请重新登录。';
  if (/settings not found/i.test(message)) return '尚未加载设置，请稍后重试。';
  if (/Could not find or create chat log file/i.test(message)) return '无法找到或创建聊天日志文件，请检查设置中的 Diablo II 游戏目录。';
  if (/clipboard API not available/i.test(message)) return '无法访问剪贴板，请检查系统权限后重试。';
  if (/network|failed to fetch|fetch failed|connection|ECONN|ENOTFOUND/i.test(message)) return '网络连接失败，请检查网络后重试。';
  if (/timeout|timed out/i.test(message)) return '请求超时，请稍后重试。';
  return status ? `${fallback}（HTTP ${status}）` : fallback;
}
