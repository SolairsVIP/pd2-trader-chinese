import { z } from 'zod';

/** A `{name}` in a template: a token filled from the conversation, or a placeholder asked for on use. */
const TEMPLATE_FIELD = /\{([A-Za-z0-9_ -]{1,24})\}/g;

/** Tokens filled automatically from the conversation; any other `{name}` is asked for when the template is used. */
export const RESERVED_TEMPLATE_TOKENS: readonly string[] = [
  'accountName',
  'characterName',
  'itemName',
  'price',
  'gameInfo',
];

/**
 * Fills a user-editable message template (Settings → Chat, the chat's "/" menu) in one pass: `{token}`s listed
 * in `vars` everywhere they appear (a missing value with ''), then the user's answers to its custom
 * placeholders (`{game}`, `{pw}`, by trimmed name). Values go in literally (never expanded again); anything
 * else stays as typed.
 */
export function fillTemplate(
  template: string,
  vars: Readonly<Record<string, string | number | null | undefined>>,
  answers: Readonly<Record<string, string>> = {},
): string {
  return template.replace(TEMPLATE_FIELD, (field, raw: string) => {
    if (/^\w+$/.test(raw) && Object.prototype.hasOwnProperty.call(vars, raw)) return String(vars[raw] ?? '');
    const name = raw.trim();
    return name && Object.prototype.hasOwnProperty.call(answers, name) ? answers[name] : field;
  });
}

/**
 * The custom placeholders of a template — every `{name}` (letters, digits, `_`, `-` and spaces, up to 24) that
 * isn't a reserved token — trimmed, deduped, in order of first appearance.
 */
export function templatePlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const [, raw] of template.matchAll(TEMPLATE_FIELD)) {
    const name = raw.trim();
    if (name && !RESERVED_TEMPLATE_TOKENS.includes(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

/** A user-defined chat message template, offered by the composer's "/" menu (Settings → Chat). */
export interface ChatTemplate {
  id: string;
  name: string;
  text: string;
  /** Starred: shown as a one-click chip above the chat composer. */
  favorite?: boolean;
}

export const CHAT_TEMPLATE_NAME_MAX = 40;
export const CHAT_TEMPLATE_TEXT_MAX = 500;

/** Name and text of a chat template as the settings editor validates them. */
export const chatTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请填写模板名称')
    .max(CHAT_TEMPLATE_NAME_MAX, `名称最多可输入 ${CHAT_TEMPLATE_NAME_MAX} 个字符`),
  text: z
    .string()
    .trim()
    .min(1, '请填写消息内容')
    .max(CHAT_TEMPLATE_TEXT_MAX, `消息最多可输入 ${CHAT_TEMPLATE_TEXT_MAX} 个字符`),
});

/** The tokens a chat template can use, filled from the open conversation. */
export const CHAT_TEMPLATE_TOKENS = [
  { token: '{accountName}', description: '对方的账号名称' },
  { token: '{characterName}', description: '对方的角色名称' },
  { token: '{itemName}', description: '最近关联或密语提到的物品' },
  { token: '{price}', description: '物品价格' },
] as const;

/** The templates new installs (and settings files from before custom templates) start with. */
export const DEFAULT_CHAT_TEMPLATES: ChatTemplate[] = [
  {
    id: 'default-still-available',
    name: '还在吗？ / Still available?',
    text: 'Hi, is your {itemName} still available?',
    favorite: true,
  },
  { id: 'default-sold', name: '抱歉，已售出 / Sold, sorry', text: "Sorry, it's already sold.", favorite: true },
  {
    id: 'default-inv-me',
    name: '邀请我 / Invite me',
    text: "Sure, invite me when you're ready.",
    favorite: true,
  },
  { id: 'default-ty-gl', name: '谢谢，祝好运 / Thanks, good luck', text: 'Thanks, good luck!', favorite: true },
  {
    id: 'default-price-check',
    name: '询价 / Price check',
    text: 'Would you accept {price} for {itemName}?',
  },
];

/** Guards entries read from the settings file (hand-edited or corrupt files). */
export function isChatTemplate(value: unknown): value is ChatTemplate {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, text } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && typeof text === 'string';
}
