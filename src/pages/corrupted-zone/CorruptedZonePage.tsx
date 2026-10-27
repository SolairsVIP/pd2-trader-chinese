import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOptions } from '@/hooks/useOptions';
import { useOverlay, usePanel } from '@/overlay';
import { viewportRect } from '@/overlay/game';
import { holdRegionLoop } from '@/overlay/region';
import { zoneRect } from './appearance';
import CorruptedZoneCard from './CorruptedZoneCard';

export default function CorruptedZonePage() {
  const { settings, updateSettings } = useOptions();
  const { rect, setRect, visible } = usePanel<'corruptedZone'>();
  const { openPanel } = useOverlay();
  const [now, setNow] = useState(Date.now);
  const [viewport, setViewport] = useState(viewportRect);
  const [height, setHeight] = useState(48);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    origin: typeof rect;
    latest: typeof rect;
    release: () => void;
    moved: boolean;
  } | null>(null);
  const width = settings.corruptedZoneWidth;
  const position = settings.corruptedZonePosition;
  useEffect(() => {
    const resize = () => setViewport(viewportRect());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!drag.current) setRect(zoneRect(width, height, viewport, position));
  }, [width, height, viewport, position, setRect, visible]);
  useEffect(() => {
    if (!visible && drag.current) {
      drag.current.release();
      drag.current = null;
    }
  }, [visible]);
  useEffect(() => () => drag.current?.release(), []);

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = drag.current;
    if (!press) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    press.release();
    if (press.moved) {
      // Close to the top edge snaps back to the default top-centre anchor.
      updateSettings({ corruptedZonePosition: press.latest.y <= 24 ? null : { x: press.latest.x, y: press.latest.y } });
      if (press.latest.y <= 24) setRect(zoneRect(width, height, viewport));
    }
  };
  return (
    <div className="h-full w-full overflow-auto">
      <div ref={content}>
        <CorruptedZoneCard
          language={settings.uiLanguage}
          now={now}
          expanded={settings.corruptedZoneExpanded === true}
          customColors={settings.corruptedZoneCustomColors}
          colors={settings.corruptedZoneColors}
          transparency={settings.corruptedZoneTransparency}
          themeId={settings.themeId}
          damageType={settings.corruptedZoneDamageType}
          onDamageChange={(damage) => updateSettings({ corruptedZoneDamageType: damage })}
          onClose={() => updateSettings({ corruptedZoneEnabled: false })}
          onExpand={() => updateSettings({ corruptedZoneExpanded: !settings.corruptedZoneExpanded })}
          onReset={() => {
            updateSettings({ corruptedZonePosition: null });
            setRect(zoneRect(width, height, viewport));
          }}
          onSettings={() => openPanel('settings', { section: 'Corrupted Zone' })}
          dragHandlers={{
            onPointerDown: (e) => {
              if (e.button !== 0 || (e.target as Element).closest('button')) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                origin: rect,
                latest: rect,
                release: holdRegionLoop(),
                moved: false,
              };
            },
            onPointerMove: (e) => {
              const press = drag.current;
              if (!press) return;
              const dx = e.clientX - press.x,
                dy = e.clientY - press.y;
              if (!press.moved && Math.hypot(dx, dy) < 4) return;
              press.moved = true;
              press.latest = zoneRect(width, height, viewport, { x: press.origin.x + dx, y: press.origin.y + dy });
              setRect(press.latest);
            },
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onLostPointerCapture: endDrag,
            onDoubleClick: (e) => {
              if (!(e.target as Element).closest('button'))
                updateSettings({ corruptedZoneExpanded: !settings.corruptedZoneExpanded });
            },
          }}
        />
      </div>
    </div>
  );
}
