import { useCallback, useState } from 'react';
import { checkForAvailableUpdate, installUpdateAndRelaunch } from '@/lib/updater';

/** Manual update controls; no modal window or automatic installation. */
export function useUpdater() {
  const [isUpdating, setIsUpdating] = useState(false);
  const downloadUpdate = useCallback(async () => {
    setIsUpdating(true);
    try { return await installUpdateAndRelaunch(); }
    finally { setIsUpdating(false); }
  }, []);
  return { checkForUpdates: checkForAvailableUpdate, downloadUpdate, isUpdating };
}
