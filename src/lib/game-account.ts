/** Extract an account from a plain name or the game's character*account display. */
export function gameAccount(value?: string | null): string | undefined {
  const text = value?.trim();
  if (!text) return;
  const parts = text.split('*');
  if (parts.length > 2) return;
  const account = parts.at(-1)?.trim();
  return account && !/\s/.test(account) ? account : undefined;
}

export function buildGameWhisper(target: string | undefined, message: string): string | undefined {
  const account = gameAccount(target);
  return account ? `/w *${account} ${message}` : undefined;
}
