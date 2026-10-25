import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

/** Physical px relative to Main's top-left (Rust `RegionRect`). */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything that must receive clicks; the rest of the transparent overlay is click-through. */
export const INTERACTIVE_SELECTOR = [
  '[data-interactive="true"]',
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-sonner-toast]',
  '[data-overlay-interactive]',
].join(', ');

export const REGION_PADDING = 4;

/** CSS rect → physical px: scale by dpr, floor the top-left, ceil the bottom-right, pad, clamp at 0. Null when empty. */
export function toRegionRect(
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  dpr: number,
  pad = REGION_PADDING,
): RegionRect | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const left = Math.max(0, Math.floor(rect.left * dpr) - pad);
  const top = Math.max(0, Math.floor(rect.top * dpr) - pad);
  const right = Math.ceil(rect.right * dpr) + pad;
  const bottom = Math.ceil(rect.bottom * dpr) + pad;
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Converts and de-duplicates rects (identical rects collapse into one), keeping document order. */
export function buildRegion(rects: Iterable<Parameters<typeof toRegionRect>[0]>, dpr: number): RegionRect[] {
  const seen = new Set<string>();
  const out: RegionRect[] = [];
  for (const rect of rects) {
    const r = toRegionRect(rect, dpr);
    if (!r) continue;
    const key = `${r.x},${r.y},${r.width},${r.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function regionsEqual(a: RegionRect[] | null, b: RegionRect[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.width === b[i].width && r.height === b[i].height);
}

export function collectRegion(root: ParentNode = document, dpr = window.devicePixelRatio || 1): RegionRect[] {
  const elements = Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR));
  return buildRegion(
    elements.map((el) => el.getBoundingClientRect()),
    dpr,
  );
}

// ---- scheduler (state changes must work even while the native host is hidden) ----

let lastSent: RegionRect[] | null = null;
let frame: number | null = null;
let loopHolders = 0;
let enabled = false;
let inFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let scheduled = false;
let generation = 0;
let motionFallback: ReturnType<typeof setTimeout> | null = null;
const readyWaiters = new Set<{ resolve(): void; reject(error: Error): void }>();

/** Resolve only after the current DOM region has been acknowledged by the native host. */
export function syncRegionBeforeFocus(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  if (!enabled) return Promise.reject(new Error('Overlay region synchronization is not running'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => waiter.reject(new Error('Overlay presentation timed out')), 2500);
    const waiter = {
      resolve: () => {
        clearTimeout(timer);
        readyWaiters.delete(waiter);
        resolve();
      },
      reject: (error: Error) => {
        clearTimeout(timer);
        readyWaiters.delete(waiter);
        reject(error);
      },
    };
    readyWaiters.add(waiter);
    requestRegionSync();
  });
}

function cancelMotionFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  if (motionFallback !== null) clearTimeout(motionFallback);
  motionFallback = null;
}

function scheduleMotionFrame() {
  if (frame !== null) return;
  frame = requestAnimationFrame(flush);
  // The renderer may stop frames when fully occluded. Gestures must still release/update their region.
  motionFallback = setTimeout(flush, 32);
}

function flush() {
  cancelMotionFrame();
  if (!enabled) return;
  const rects = collectRegion();
  if (!inFlight && regionsEqual(lastSent, rects)) {
    for (const waiter of readyWaiters) waiter.resolve();
  }
  if (!inFlight && !regionsEqual(lastSent, rects)) {
    inFlight = true;
    const sentGeneration = generation;
    // Serialize native resize/region updates. A slow earlier response must not restore an old menu size.
    invoke('set_interactive_region', { rects })
      .then(() => {
        if (sentGeneration !== generation) return;
        lastSent = rects;
        failures = 0;
      })
      .catch((error) => {
        if (sentGeneration !== generation) return;
        lastSent = null;
        failures += 1;
        console.warn('[overlay] set_interactive_region failed:', error);
      })
      .finally(() => {
        inFlight = false;
        if (!enabled) return;
        if (failures > 0) {
          // Retry transient native failures even if the DOM stops changing. Do not spin on a permanent failure.
          if (failures <= 3)
            retryTimer = setTimeout(() => {
              retryTimer = null;
              requestRegionSync();
            }, failures * 100);
          else for (const waiter of readyWaiters) waiter.reject(new Error('Native region update failed'));
        } else requestRegionSync();
      });
  }
  if (loopHolders > 0) scheduleMotionFrame();
}

/** Coalesce DOM state changes in a microtask. Never wait for a paint to show a hidden native window. */
export function requestRegionSync(): void {
  if (!enabled || scheduled) return;
  scheduled = true;
  const requestedGeneration = generation;
  queueMicrotask(() => {
    if (requestedGeneration !== generation) return;
    scheduled = false;
    flush();
  });
}

/** Keep syncing every frame while a drag/resize is active. Returns the release function. */
export function holdRegionLoop(): () => void {
  loopHolders += 1;
  requestRegionSync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    loopHolders = Math.max(0, loopHolders - 1);
    requestRegionSync();
  };
}

/** Keeps Main's OS input region equal to the union of interactive elements. Tauri only. */
export function useRegionSync(): void {
  useEffect(() => {
    if (!isTauri()) return;
    enabled = true;
    generation += 1;
    scheduled = false;
    lastSent = null;
    failures = 0;
    const sync = () => requestRegionSync();

    const mutations = new MutationObserver(sync);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true });
    const resizes = new ResizeObserver(sync);
    resizes.observe(document.body);
    window.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('transitionend', sync, true);
    document.addEventListener('animationend', sync, true);
    sync();

    return () => {
      enabled = false;
      for (const waiter of readyWaiters) waiter.reject(new Error('Overlay region synchronization stopped'));
      generation += 1;
      scheduled = false;
      mutations.disconnect();
      resizes.disconnect();
      window.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('transitionend', sync, true);
      document.removeEventListener('animationend', sync, true);
      cancelMotionFrame();
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    };
  }, []);
}
