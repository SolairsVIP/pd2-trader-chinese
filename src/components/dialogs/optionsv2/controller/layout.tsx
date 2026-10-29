import React from 'react';
import { useUiText } from '@/lib/ui-language';
import { useOptions } from '@/hooks/useOptions';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { clampControllerPointerSpeed } from '@/pages/price-check/controller-pointer';
import { SettingsSection } from '../settings-ui';

export default function SettingsController() {
  const t = useUiText();
  const { settings, isLoading, updateSettings } = useOptions();
  const [speed, setSpeed] = React.useState(() => clampControllerPointerSpeed(settings.controllerPointerSpeed));
  React.useEffect(() => setSpeed(clampControllerPointerSpeed(settings.controllerPointerSpeed)), [settings.controllerPointerSpeed]);
  return (
    <SettingsSection title={t('手柄')} description={t('配置手柄查价和插件控制。')}>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">{t('手柄快捷查价：L2 + R2 / LT + RT')}</p>
          <p className="text-xs text-muted-foreground">{t('支持 PS4 / PS5 原生手柄和 Xbox / XInput 手柄；游戏仍会响应组合按键，可能与游戏操作冲突。')}</p>
          <p className="text-xs text-muted-foreground">{t('查价窗口：左摇杆移动光标，右摇杆滚动，✕ / A 点击，○ / B 关闭。')}</p>
          <p className="text-xs text-muted-foreground">{t('已知问题：Xbox 手柄操作查价窗口时，游戏中的光标也可能同时移动；建议暂时使用鼠标操作查价窗口。')}</p>
        </div>
        <Switch aria-label={t('手柄快捷查价')} checked={settings.controllerPriceCheckEnabled === true} disabled={isLoading} onCheckedChange={(value) => void updateSettings({ controllerPriceCheckEnabled: value })} />
      </div>
      <div className="rounded-lg border border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-4 text-sm">
          <span>{t('手柄光标速度')}</span>
          <span className="tabular-nums text-muted-foreground">{speed}%</span>
        </div>
        <Slider aria-label={t('手柄光标速度')} min={50} max={200} step={10} value={[speed]} disabled={isLoading}
          onValueChange={([value]) => setSpeed(value)}
          onValueCommit={([value]) => void updateSettings({ controllerPointerSpeed: value })} />
        <p className="mt-2 text-xs text-muted-foreground">{t('调整查价窗口左摇杆控制光标的速度；100% 为默认速度。')}</p>
      </div>
    </SettingsSection>
  );
}
