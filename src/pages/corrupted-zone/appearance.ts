import type { CSSProperties } from 'react';
import type { OverlayRect } from '@/overlay/types';
import { getTheme } from '@/lib/themes';

export const DEFAULT_ZONE_COLORS = { background: '#171e2b', text: '#f2f4f8', accent: '#d6b46a' };
export type ZoneColors = typeof DEFAULT_ZONE_COLORS;

export function validColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function zoneColors(saved?: Partial<ZoneColors>): ZoneColors {
  return {
    background: validColor(saved?.background, DEFAULT_ZONE_COLORS.background),
    text: validColor(saved?.text, DEFAULT_ZONE_COLORS.text),
    accent: validColor(saved?.accent, DEFAULT_ZONE_COLORS.accent),
  };
}

export const ZONE_TRANSPARENCY_MAX = 90;

export function zoneTransparency(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(ZONE_TRANSPARENCY_MAX, Math.max(0, value)))
    : 0;
}

export function zoneStyle(
  custom: boolean,
  colors?: Partial<ZoneColors>,
  transparency?: number,
  themeId?: string,
): CSSProperties {
  const opacity = `${100 - zoneTransparency(transparency)}%`;
  // Re-declare the surface on the card: an inherited CSS variable has already
  // resolved the app-wide opacity on <html> and cannot be adjusted locally.
  const surface = {
    '--window-opacity': opacity,
    '--window-opacity-elevated': opacity,
    '--surface': getTheme(themeId).vars.surface,
  };
  if (!custom) return surface as CSSProperties;
  const c = zoneColors(colors);
  return {
    ...surface,
    '--surface': `color-mix(in oklab, ${c.background} var(--window-opacity), transparent)`,
    '--surface-foreground': c.text,
    '--muted-foreground': c.text,
    '--border': c.accent,
    '--primary': c.accent,
  } as CSSProperties;
}

export function zoneWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(960, Math.max(480, value))) : 720;
}

/** Overlay viewport = the active monitor work area, not the game client rectangle. */
export function zoneRect(
  width: unknown,
  height: number,
  viewport: OverlayRect,
  position?: { x: number; y: number } | null,
): OverlayRect {
  const w = Math.min(zoneWidth(width), Math.max(1, viewport.width - 16));
  const h = Math.min(Math.max(1, height), viewport.height);
  const custom = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null;
  return {
    x: Math.round(
      Math.max(
        viewport.x,
        Math.min(custom?.x ?? viewport.x + (viewport.width - w) / 2, viewport.x + viewport.width - w),
      ),
    ),
    y: Math.round(Math.max(viewport.y, Math.min(custom?.y ?? viewport.y + 8, viewport.y + viewport.height - h))),
    width: w,
    height: h,
  };
}
