import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isKeyboardClaimed } from '@/overlay';
import { useOptions } from '@/hooks/useOptions';
import { clickControllerPointer, moveControllerPointer, scrollControllerPointer, type Point } from './controller-pointer';

/** A virtual cursor scoped to the price-check panel; it never moves the Windows or game cursor. */
export default function ControllerPointer({ close }: { close: () => void }) {
  const cursor = useRef<HTMLDivElement>(null);
  const { settings } = useOptions();
  const speed = useRef(settings.controllerPointerSpeed);
  speed.current = settings.controllerPointerSpeed;

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>('[data-panel-id="itemSearch"]');
    if (!panel || !cursor.current) return;
    const element = cursor.current;
    const rect = panel.getBoundingClientRect();
    let point: Point = { x: (rect.left + Math.min(rect.right, window.innerWidth)) / 2, y: (rect.top + Math.min(rect.bottom, window.innerHeight)) / 2 };
    let stick: [number, number] = [128, 128];
    let scrollStick = 128;
    let stickAt = 0;
    let previous = performance.now();
    let disposed = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const stops: Array<() => void> = [];
    const subscribe = <T,>(name: string, handler: (value: T) => void) => {
      void listen<T>(name, (event) => handler(event.payload)).then((stop) => {
        if (disposed) stop(); else stops.push(stop);
      }).catch(console.error);
    };
    subscribe<[number, number, number]>('controller-stick', (value) => {
      if (!isKeyboardClaimed()) return;
      stick = [value[0], value[1]];
      scrollStick = value[2];
      stickAt = performance.now();
    });
    subscribe<string>('controller-menu-action', (action) => {
      if (!isKeyboardClaimed()) return;
      if (action === 'close') {
        // The native handler emits close after Circle is released. Keep focus briefly so
        // the game's input loop cannot see the press during the focus hand-off.
        if (closeTimer === undefined) closeTimer = setTimeout(() => {
          closeTimer = undefined;
          if (isKeyboardClaimed()) close();
        }, 120);
      }
      else if (action === 'confirm') clickControllerPointer(panel, point);
      else if (action === 'up' || action === 'down') {
        let target = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
        while (target && panel.contains(target)) {
          if (target.scrollHeight > target.clientHeight && /(auto|scroll)/.test(getComputedStyle(target).overflowY)) {
            target.scrollBy({ top: action === 'down' ? 140 : -140 });
            break;
          }
          target = target.parentElement;
        }
      }
    });
    let frame = 0;
    const update = (now: number) => {
      const bounds = panel.getBoundingClientRect();
      if (isKeyboardClaimed()) {
        const seconds = (now - previous) / 1000;
        point = moveControllerPointer(point, now - stickAt < 250 ? stick : [128, 128], (now - previous) / 1000, {
          left: Math.max(0, bounds.left), top: Math.max(0, bounds.top),
          right: Math.min(window.innerWidth, bounds.right), bottom: Math.min(window.innerHeight, bounds.bottom),
        }, speed.current);
        scrollControllerPointer(panel, point, now - stickAt < 250 ? scrollStick : 128, seconds);
      }
      previous = now;
      element.style.transform = `translate(${point.x}px, ${point.y}px)`;
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => { disposed = true; if (closeTimer !== undefined) clearTimeout(closeTimer); cancelAnimationFrame(frame); stops.forEach((stop) => stop()); };
  }, [close]);

  return <div ref={cursor} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[9999]">
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M2 1v19l5-5 4 9 4-2-4-9h8z" fill="white" stroke="#381765" strokeWidth="2" strokeLinejoin="round" /></svg>
  </div>;
}
