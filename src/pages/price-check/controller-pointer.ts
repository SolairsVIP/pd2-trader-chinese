export type Point = { x: number; y: number };
/** Switch the active panel's first visible tab bar without targeting other windows. */
export function switchControllerTab(panel: HTMLElement, direction: -1 | 1): boolean {
  const lists = Array.from(panel.querySelectorAll<HTMLElement>('[role="tablist"]'));
  const list = lists.find((node) => !node.closest('[hidden], [aria-hidden="true"], [data-state="inactive"]') && getComputedStyle(node).display !== 'none');
  if (!list) return false;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).filter((tab) =>
    !tab.matches(':disabled, [aria-disabled="true"], [hidden]') && getComputedStyle(tab).display !== 'none');
  if (tabs.length < 2) return false;
  const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  const next = current < 0 ? (direction > 0 ? 0 : tabs.length - 1) : (current + direction + tabs.length) % tabs.length;
  const tab = tabs[next];
  // Radix Tabs activates on mousedown, while other tab controls may use click.
  tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, view: window }));
  tab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, view: window }));
  tab.click();
  return true;
}
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

/** Include panel-owned floating content even when Radix positions it beyond the panel frame. */
export function controllerPointerBounds(panel: HTMLElement, width: number, height: number): Bounds {
  const rect = panel.getBoundingClientRect();
  let { left, top, right, bottom } = rect;
  const floating = panel.querySelectorAll<HTMLElement>('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]');
  floating.forEach((node) => {
    const r = node.getBoundingClientRect();
    if (r.right <= r.left || r.bottom <= r.top) return;
    left = Math.min(left, r.left); top = Math.min(top, r.top);
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  });
  return { left: Math.max(0, left), top: Math.max(0, top), right: Math.min(width, right), bottom: Math.min(height, bottom) };
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

export function dismissControllerPopup(panel: HTMLElement): boolean {
  const popups = panel.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]');
  const popup = popups[popups.length - 1];
  if (!popup) return false;
  popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return true;
}

export function updateControllerHover(panel: HTMLElement, point: Point, previous: Element | null): Element | null {
  const hit = document.elementFromPoint(point.x, point.y);
  const target = hit instanceof Element && panel.contains(hit) ? hit : null;
  const options = { bubbles: true, clientX: point.x, clientY: point.y, view: window };
  if (target !== previous) {
    previous?.dispatchEvent(new PointerEvent('pointerout', { ...options, relatedTarget: target, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
    previous?.dispatchEvent(new MouseEvent('mouseout', { ...options, relatedTarget: target }));
    target?.dispatchEvent(new PointerEvent('pointerover', { ...options, relatedTarget: previous, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
    target?.dispatchEvent(new MouseEvent('mouseover', { ...options, relatedTarget: previous }));
  }
  target?.dispatchEvent(new PointerEvent('pointermove', { ...options, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
  target?.dispatchEvent(new MouseEvent('mousemove', options));
  return target;
}

export function clickControllerPointer(panel: HTMLElement, point: Point): void {
  const target = document.elementFromPoint(point.x, point.y);
  if (!(target instanceof Element) || !panel.contains(target)) return;
  const options = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, view: window };
  document.documentElement.setAttribute('data-controller-pointer-click', '');
  try {
    if (target instanceof HTMLElement && target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable="true"]')) target.focus();
    target.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', options));
    target.dispatchEvent(new MouseEvent('click', options));
  } finally {
    document.documentElement.removeAttribute('data-controller-pointer-click');
  }
}
