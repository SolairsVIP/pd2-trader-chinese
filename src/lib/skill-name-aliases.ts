/** Exact, observed clipboard spellings only; never guess another skill. */
export function canonicalizeSkillName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/\bShadow Desciplines(?=\s*\(Assassin(?: Only)?\)$)/i, 'Shadow Disciplines').replace(
    /\bJavalin and Spear(?=(?: Skills| Spells)?(?:\s*\([^)]*\))?$)/i,
    'Javelin and Spear',
  );
}
