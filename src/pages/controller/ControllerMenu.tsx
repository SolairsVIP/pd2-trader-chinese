import React, { useState } from 'react';
import { Archive, ChartNoAxesCombined, ChevronRight, Coins, Gamepad2, MapPin, MessageSquare, Settings, Store } from 'lucide-react';
import { useOptions } from '@/hooks/useOptions';
import { useOverlay, usePanel } from '@/overlay';
import { WindowChrome, WindowPanel } from '@/components/custom/window-chrome';
import type { PanelId } from '@/overlay';

const entries: Array<{ label: string; id: PanelId; icon: React.ElementType }> = [
  { label: '交易大厅', id: 'market', icon: Store },
  { label: '聊天', id: 'chat', icon: MessageSquare },
  { label: '管理上架物品', id: 'quickList', icon: Archive },
  { label: '仓库价值', id: 'currency', icon: Coins },
  { label: '仓库估值', id: 'netWorthPanel', icon: ChartNoAxesCombined },
  { label: '腐化区提示', id: 'corruptedZone', icon: MapPin },
  { label: '腐化记录', id: 'corruptionLuck', icon: Archive },
  { label: '设置', id: 'settings', icon: Settings },
];

export default function ControllerMenu() {
  const { close } = usePanel<'controllerMenu'>();
  const { openPanel, closePanel } = useOverlay();
  const { updateSettings } = useOptions();
  const [hovered, setHovered] = useState<PanelId | null>(null);
  return <WindowPanel className="h-full w-full">
    <WindowChrome title="手柄功能菜单" icon={<Gamepad2 className="text-primary" />} onClose={close} />
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <p className="mb-3 rounded-md border border-border bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">左摇杆移动 · 右摇杆滚动 · ✕ 选择 · ○ 返回 · L1 / R1 切换选项卡</p>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(({ label, id, icon: Icon }) => <button key={id} type="button" data-controller-active={hovered === id ? 'true' : undefined}
          onPointerOver={() => setHovered(id)}
          onPointerOut={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHovered((current) => current === id ? null : current); }}
          className={`group flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${hovered === id ? 'border-primary bg-primary/25 text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'border-border bg-white/[0.03] text-foreground hover:border-primary hover:bg-primary/20'}`}
          onClick={() => {
          if (id === 'corruptedZone') updateSettings({ corruptedZoneEnabled: true });
          openPanel(id, undefined, { focus: true, ...(id === 'quickList' ? { placement: 'gameCenter' as const, keepPayload: true } : {}) });
          closePanel('controllerMenu', { focusGame: false });
        }}><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1">{label}</span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></button>)}
      </div>
    </div>
  </WindowPanel>;
}
