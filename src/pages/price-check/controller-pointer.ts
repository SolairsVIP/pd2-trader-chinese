export type Point = { x: number; y: number };
type Bounds = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
export const DEFAULT_CONTROLLER_POINTER_SPEED = 100;
export function clampControllerPointerSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(50, Math.min(200, value)) : DEFAULT_CONTROLLER_POINTER_SPEED;
}

function stickAxis(value: number): number {
  const normalized = Math.max(-1, Math.min(1, (value - 128) / 127));
  const magnitude = Math.abs(normalized);
  return magnitude <= 0.18 ? 0 : Math.sign(normalized) * (magnitude - 0.18) / 0.82;
}

export function moveControllerPointer(point: Point, stick: [number, number], seconds: number, bounds: Bounds, speed?: number): Point {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const dt = Math.max(0, Math.min(seconds, 0.1));
  const pixelsPerSecond = 700 * clampControllerPointerSpeed(speed) / 100;
  return {
    x: clamp(point.x + stickAxis(stick[0]) * pixelsPerSecond * dt, bounds.left, Math.max(bounds.left, bounds.right - 1)),
    y: clamp(point.y + stickAxis(stick[1]) * pixelsPerSecond * dt, bounds.top, Math.max(bounds.top, bounds.bottom - 1)),
  };
}

export function scrollControllerPointer(panel: HTMLElement, point: Point, axis: number, seconds: number): void {
  const delta = stickAxis(axis) * 600 * Math.max(0, Math.min(seconds, 0.1));
  if (!delta) return;
  let target = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
  if (!target || !panel.contains(target)) return;
  while (target && panel.contains(target)) {
    const viewport = target.matches('[data-slot="scroll-area"]')
      ? target.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') : target;
    if (viewport && viewport.scrollHeight > viewport.clientHeight && /(auto|scroll)/.test(getComputedStyle(viewport).overflowY)) {
      viewport.scrollBy({ top: delta });
      return;
    }
    target = target.parentElement;
  }
  const fallback = panel.querySelector<HTMLElement>('[data-controller-scroll-default] [data-slot="scroll-area-viewport"]');
  if (fallback && fallback.scrollHeight > fallback.clientHeight) fallback.scrollBy({ top: delta });
}

export function clickControllerPointer(panel: HTMLElement, point: Point): void {
  const target = document.elementFromPoint(point.x, point.y);
  if (!(target instanceof Element) || !panel.contains(target)) return;
  const options = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, view: window };
  document.documentElement.setAttribute('data-controller-pointer-click', '');
  try {
    target.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', options));
    target.dispatchEvent(new MouseEvent('click', options));
  } finally {
    document.documentElement.removeAttribute('data-controller-pointer-click');
  }
}
