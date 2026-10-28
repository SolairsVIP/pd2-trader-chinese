import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePanelPortalContainer } from '@/overlay/portal';
import { positionWhisperPopup } from './whisper-popup-position';

/** Keep the history close to the pointer and within the visible market panel. */
export function WhisperHistoryPopup({ pointer, children }: { pointer: { x: number; y: number }; children: ReactNode }) {
  const container = usePanelPortalContainer();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: pointer.x, top: pointer.y });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const panel = container?.closest('[data-panel-id]');
    const bounds = panel?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const visibleBounds = {
      left: Math.max(0, bounds.left), top: Math.max(0, bounds.top),
      right: Math.min(window.innerWidth, bounds.right), bottom: Math.min(window.innerHeight, bounds.bottom),
    };
    const size = element.getBoundingClientRect();
    setPosition(positionWhisperPopup(pointer, size, visibleBounds));
  }, [pointer, container, children]);
  return createPortal(
    <div ref={ref} role="tooltip" data-whisper-history-popup
      className="pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-16px)] space-y-2 rounded-lg border border-border bg-surface-elevated p-3 text-xs text-popover-foreground shadow-panel"
      style={{ left: position.left, top: position.top, pointerEvents: 'none' }}>
      {children}
    </div>,
    container ?? document.body,
  );
}
