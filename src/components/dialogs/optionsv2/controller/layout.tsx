import React from 'react';
import { useUiText } from '@/lib/ui-language';
import { useOptions } from '@/hooks/useOptions';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { clampControllerPointerSpeed } from '@/pages/price-check/controller-pointer';
import { SettingsSection } from '../settings-ui';

const MIN_POINTER_SPEED = 50;
const MAX_POINTER_SPEED = 200;
const POINTER_SPEED_STEP = 10;

export default function SettingsController() {
  const t = useUiText();
  const { settings, isLoading, updateSettings } = useOptions();
  const [speed, setSpeed] = React.useState(() => clampControllerPointerSpeed(settings.controllerPointerSpeed));
  React.useEffect(() => setSpeed(clampControllerPointerSpeed(settings.controllerPointerSpeed)), [settings.controllerPointerSpeed]);

  const onControllerPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!document.documentElement.hasAttribute('data-controller-pointer-click')) return;
    // A synthesized controller event has no active OS pointer for Radix to capture.
    event.preventDefault();
    if (isLoading) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - left) / width));
    const fromStart = event.currentTarget.dir === 'rtl' ? 1 - fraction : fraction;
    const steps = Math.round(fromStart * (MAX_POINTER_SPEED - MIN_POINTER_SPEED) / POINTER_SPEED_STEP);
    const value = clampControllerPointerSpeed(MIN_POINTER_SPEED + steps * POINTER_SPEED_STEP);
    event.currentTarget.querySelector<HTMLElement>('[role="slider"]')?.focus();
    setSpeed(value);
    // Always queue the selection: an earlier async write may still be in flight.
    void updateSettings({ controllerPointerSpeed: value });
  };
  return (
    <SettingsSection
      title={t('手柄')}
      description={t('配置手柄查价和插件控制。')}
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">{t('手柄快捷查价：L2 + R2 / LT + RT')}</p>
          <p className="text-xs text-muted-foreground">{t('支持 PS4 / PS5 原生手柄；模拟 PS 手柄的第三方设备兼容性取决于其模拟模式。')}</p>
          <p className="text-xs text-muted-foreground">{t('PS：短按并松开 L2 + R2 查价；长按打开功能菜单。左摇杆移动光标，右摇杆滚动，✕ 点击，○ 返回。')}</p>
          <p className="text-xs text-muted-foreground">{t('Xbox：按 LT + RT 查价，左摇杆移动光标，右摇杆滚动，A 点击，B 返回。其他功能暂不支持。')}</p>
          <p className="text-xs text-muted-foreground">{t('使用 Xbox 手柄操作查价窗口时，游戏可能同时响应手柄操作。')}</p>
          <p className="text-xs text-muted-foreground">{t('需要输入文字时，先用手柄选中输入框，再使用实体键盘输入。')}</p>
        </div>
        <Switch
          aria-label={t('手柄快捷查价')}
          checked={settings.controllerPriceCheckEnabled === true}
          disabled={isLoading}
          onCheckedChange={(value) => void updateSettings({ controllerPriceCheckEnabled: value })}
        />
      </div>
      <div className="rounded-lg border border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-4 text-sm">
          <span>{t('手柄光标速度')}</span>
          <span className="tabular-nums text-muted-foreground">{speed}%</span>
        </div>
        <Slider
          aria-label={t('手柄光标速度')}
          min={MIN_POINTER_SPEED}
          max={MAX_POINTER_SPEED}
          step={POINTER_SPEED_STEP}
          value={[speed]}
          disabled={isLoading}
          onPointerDown={onControllerPointerDown}
          onPointerUp={(event) => {
            if (document.documentElement.hasAttribute('data-controller-pointer-click')) event.preventDefault();
          }}
          onValueChange={([value]) => setSpeed(value)}
          onValueCommit={([value]) => void updateSettings({ controllerPointerSpeed: value })}
        />
        <p className="mt-2 text-xs text-muted-foreground">{t('调整插件窗口左摇杆控制光标的速度；100% 为默认速度。')}</p>
      </div>
    </SettingsSection>
  );
}
