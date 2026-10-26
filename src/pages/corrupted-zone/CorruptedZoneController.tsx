import { useEffect } from 'react';
import { useOptions } from '@/hooks/useOptions';
import { useOverlay } from '@/overlay';

export default function CorruptedZoneController() {
  const { settings, isLoading } = useOptions();
  const { openPanel, closePanel } = useOverlay();
  const enabled = !isLoading && settings.corruptedZoneEnabled !== false;
  useEffect(() => {
    if (enabled) openPanel('corruptedZone');
    else closePanel('corruptedZone');
  }, [enabled, openPanel, closePanel]);
  return null;
}
