let yieldedToOtherApps = false;
const listeners = new Set<() => void>();

export function getOverlayYieldedToOtherApps(): boolean {
  return yieldedToOtherApps;
}

export function setOverlayYieldedToOtherApps(yielded: boolean): void {
  if (yieldedToOtherApps === yielded) return;
  yieldedToOtherApps = yielded;
  listeners.forEach((listener) => listener());
}

export function subscribeOverlayYield(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

