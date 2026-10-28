import React, { useEffect, useRef, useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOverlay } from '@/overlay';

/** Pin only blocks automatic dismissal; the normal close button still works. */
export default function MarketPinButton() {
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const { guardPanelDismissal, setMarketPinned } = useOverlay();
  useEffect(() => { setMarketPinned(pinned); }, [pinned, setMarketPinned]);
  useEffect(() => () => setMarketPinned(false), [setMarketPinned]);
  useEffect(() => guardPanelDismissal('market', () => !pinnedRef.current), [guardPanelDismissal]);
  const label = pinned ? '取消固定窗口' : '固定窗口';
  return (
    <Button variant="ghost" size="sm" className={pinned ? 'size-7 p-0 text-primary' : 'size-7 p-0'}
      aria-label={label} aria-pressed={pinned} title={label} onClick={() => setPinned((value) => !value)}>
      {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
    </Button>
  );
}
