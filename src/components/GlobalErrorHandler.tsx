import { useEffect } from 'react';
import { listen } from '@/lib/browser-events';
import { showToast } from '@/overlay';
import { describeUiError } from '@/lib/ui-error';

export function GlobalErrorHandler() {
  useEffect(() => {
    // Rust-emitted errors (chat watcher etc.) -> overlay toast
    const unlistenPromise = listen<string>('error', (event) => {
      console.error('[app] Backend error:', event.payload);
      showToast({
        title: '发生错误',
        description: describeUiError(event.payload),
        variant: 'error',
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return null;
}
