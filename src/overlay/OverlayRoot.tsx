import React, { useCallback, useEffect, useState } from 'react';
import { claimKeyboard, releaseKeyboard } from './keyboard';
import { useRegionSync } from './region';
import { isPanelVisible, useOverlay, useOverlayInternals } from './OverlayProvider';
import { Panel } from './Panel';
import { ToastLayer } from './toast';
import type { PanelId } from './types';
import ControllerPointer from '@/pages/price-check/ControllerPointer';

const isTextInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/** Full-viewport click-through layer hosting every mounted panel plus the toast layer. */
export const OverlayRoot: React.FC = () => {
  const { defs, state, gameFocused, marketPinned } = useOverlayInternals();
  const { closePanel } = useOverlay();
  const [controllerMode, setControllerMode] = useState(false);
  const activePanel = (Object.keys(state.panels) as PanelId[])
    .filter((id) => !['chatButton', 'netWorthTicker'].includes(id) && isPanelVisible(defs[id], state.panels[id], gameFocused, id === 'market' && marketPinned))
    .sort((a, b) => (state.panels[b]?.z ?? 0) - (state.panels[a]?.z ?? 0))[0];
  const closeActive = useCallback(() => {
    if (activePanel === 'corruptedZone') {
      setControllerMode(false);
      void releaseKeyboard({ focusGame: true });
    } else if (activePanel) closePanel(activePanel);
  }, [activePanel, closePanel]);
  useEffect(() => {
    const activate = () => setControllerMode(true);
    const deactivate = () => setControllerMode(false);
    window.addEventListener('controller-activate', activate);
    window.addEventListener('controller-deactivate', deactivate);
    return () => {
      window.removeEventListener('controller-activate', activate);
      window.removeEventListener('controller-deactivate', deactivate);
    };
  }, []);
  useRegionSync();

  // Typing anywhere (also in keyboard:'never' panels and portalled popovers) needs the OS keyboard focus.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target)) void claimKeyboard();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 overflow-hidden"
        data-overlay-root>
        {(Object.keys(defs) as PanelId[]).map((id) => {
          const panel = state.panels[id];
          if (!panel || !(panel.open || defs[id].keepMounted)) return null;
          return <Panel key={id}
            id={id} />;
        })}
      </div>
      {controllerMode && activePanel && <ControllerPointer key={activePanel} panelId={activePanel} close={closeActive} />}
      <ToastLayer />
    </>
  );
};
