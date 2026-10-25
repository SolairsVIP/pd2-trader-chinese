/** Match a complete catalogue name after a Chinese label, never a fuzzy substring. */
export function bilingualGameLabel<T>(
  text: string,
  catalogue: ReadonlyMap<string, ReadonlySet<T>>,
): { prefix: string; value: T } | undefined {
  const label = text.replace(/ÿc./g, '').replace(/\s+/g, ' ').trim();
  const candidates: { prefix: string; value: T; length: number }[] = [];
  for (const [english, values] of catalogue) {
    if (values.size !== 1 || !/^[a-z]/i.test(english)) continue;
    for (const suffix of [english, `(${english})`, `（${english}）`]) {
      if (!label.toLowerCase().endsWith(suffix.toLowerCase())) continue;
      const prefix = label.slice(0, -suffix.length).trim();
      // Chinese and damaged Chinese labels can contain punctuation. An ASCII
      // word/number in the prefix would be an unrelated sentence or item name.
      if (!/[\u3400-\u9fff]/u.test(prefix) || /[a-z0-9]/i.test(prefix)) continue;
      candidates.push({ prefix, value: values.values().next().value!, length: suffix.length });
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}
