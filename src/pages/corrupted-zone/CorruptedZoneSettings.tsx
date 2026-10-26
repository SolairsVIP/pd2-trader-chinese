import React from 'react';
import { useForm } from 'react-hook-form';
import { useOptions } from '@/hooks/useOptions';
import { Form, FormControl, FormField } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  SettingsGroup,
  SettingsHint,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from '@/components/dialogs/optionsv2/settings-ui';
import { DEFAULT_ZONE_COLORS, zoneColors, zoneWidth } from './appearance';
import CorruptedZoneCard from './CorruptedZoneCard';
import { DAMAGE_CHOICES, DAMAGE_TYPES, damageSelection, RECOMMENDATION_NOTE } from './recommendation';

export default function CorruptedZoneSettings() {
  const { settings, updateSettings, isLoading } = useOptions();
  // Fields use the shared settings row/form accessibility wiring; changes persist through OptionsProvider.
  const form = useForm();
  const colors = zoneColors(settings.corruptedZoneColors);
  if (isLoading) return <SettingsSkeleton rows={4} />;
  return (
    <SettingsSection
      title="腐化区提示"
      description="中英双语细横条，中文居中、大号倒计时，默认吸附在屏幕顶部中央，只在游戏激活时显示；可拖动标题栏，靠近顶部松开即恢复吸附。"
    >
      <Form {...form}>
        <SettingsGroup title="刷图免疫参考">
          <div className="space-y-2 px-4 py-3">
            <p className="text-sm">选择角色主要伤害类型</p>
            <div role="group" aria-label="主要伤害类型" className="flex flex-wrap gap-2">
              {DAMAGE_CHOICES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={damageSelection(settings.corruptedZoneDamageType) === type ? 'default' : 'outline'}
                  aria-pressed={damageSelection(settings.corruptedZoneDamageType) === type}
                  onClick={() => updateSettings({ corruptedZoneDamageType: type })}
                >
                  {type === 'none' ? '不提示' : DAMAGE_TYPES[type]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{RECOMMENDATION_NOTE}</p>
          </div>
        </SettingsGroup>
        <SettingsGroup title="显示与位置">
          <FormField
            name="enabled"
            control={form.control}
            render={() => (
              <SettingsRow
                label="启用腐化区提示"
                description="无需登录。关闭后可从本页或右下角“更多 → 腐化区提示”恢复。"
                control={
                  <FormControl>
                    <Switch
                      checked={settings.corruptedZoneEnabled !== false}
                      onCheckedChange={(enabled) => updateSettings({ corruptedZoneEnabled: enabled })}
                    />
                  </FormControl>
                }
              />
            )}
          />
          <FormField
            name="width"
            control={form.control}
            render={() => (
              <SettingsRow
                label="提示窗口宽度"
                description="480–960 像素；小屏幕自动缩小，避免遮挡过多游戏画面。"
                layout="stacked"
                control={
                  <>
                    <FormControl>
                      <Slider
                        aria-label="提示窗口宽度"
                        className="flex-1"
                        min={480}
                        max={960}
                        step={10}
                        value={[zoneWidth(settings.corruptedZoneWidth)]}
                        onValueChange={([value]) => updateSettings({ corruptedZoneWidth: value })}
                      />
                    </FormControl>
                    <span className="w-16 text-right font-mono text-xs">
                      {zoneWidth(settings.corruptedZoneWidth)} px
                    </span>
                  </>
                }
              />
            )}
          />
          <FormField
            name="expanded"
            control={form.control}
            render={() => (
              <SettingsRow
                label="展开未来四轮"
                description="也可点击小窗右上角箭头或双击标题栏展开、收起。"
                control={
                  <FormControl>
                    <Switch
                      checked={settings.corruptedZoneExpanded === true}
                      onCheckedChange={(expanded) => updateSettings({ corruptedZoneExpanded: expanded })}
                    />
                  </FormControl>
                }
              />
            )}
          />
          <div className="px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => updateSettings({ corruptedZonePosition: null })}>
              恢复屏幕顶部居中
            </Button>
          </div>
        </SettingsGroup>
        <SettingsGroup title="UI 颜色">
          <FormField
            name="custom"
            control={form.control}
            render={() => (
              <SettingsRow
                label="自定义提示窗口颜色"
                description="关闭时跟随查价器主题；开启后可分别调整背景、文字与强调色。"
                control={
                  <FormControl>
                    <Switch
                      checked={settings.corruptedZoneCustomColors === true}
                      onCheckedChange={(custom) => updateSettings({ corruptedZoneCustomColors: custom })}
                    />
                  </FormControl>
                }
              />
            )}
          />
          {settings.corruptedZoneCustomColors &&
            (['background', 'text', 'accent'] as const).map((key) => (
              <FormField
                key={key}
                name={key}
                control={form.control}
                render={() => (
                  <SettingsRow
                    label={{ background: '背景颜色', text: '文字颜色', accent: '强调颜色' }[key]}
                    control={
                      <FormControl>
                        <input
                          aria-label={{ background: '背景颜色', text: '文字颜色', accent: '强调颜色' }[key]}
                          type="color"
                          value={colors[key]}
                          className="h-8 w-14 cursor-pointer rounded border border-border bg-transparent"
                          onChange={(e) =>
                            updateSettings({ corruptedZoneColors: { ...colors, [key]: e.target.value } })
                          }
                        />
                      </FormControl>
                    }
                  />
                )}
              />
            ))}
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateSettings({ corruptedZoneCustomColors: true, corruptedZoneColors: DEFAULT_ZONE_COLORS })
              }
            >
              暗金配色
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateSettings({
                  corruptedZoneCustomColors: true,
                  corruptedZoneColors: { background: '#f6f3eb', text: '#252321', accent: '#765016' },
                })
              }
            >
              浅色配色
            </Button>
            <Button variant="outline" size="sm" onClick={() => updateSettings({ corruptedZoneCustomColors: false })}>
              跟随主题
            </Button>
          </div>
        </SettingsGroup>
      </Form>
      <div className="max-w-full" style={{ width: zoneWidth(settings.corruptedZoneWidth) }}>
        <p className="mb-2 text-xs text-muted-foreground">外观预览（实际窗口按屏幕空间自动适配）</p>
        <CorruptedZoneCard
          now={Date.now()}
          expanded={settings.corruptedZoneExpanded === true}
          customColors={settings.corruptedZoneCustomColors}
          colors={colors}
          damageType={settings.corruptedZoneDamageType}
          onDamageChange={(damage) => updateSettings({ corruptedZoneDamageType: damage })}
          onExpand={() => updateSettings({ corruptedZoneExpanded: !settings.corruptedZoneExpanded })}
        />
      </div>
      <SettingsHint>
        腐化区提示原作者：Blyat。按 UTC 每 15
        分钟离线计算，时间显示为本地时区，请保持系统时间准确。这是建房时间表预报，已有房间可能保留建房时区域，请以游戏公告为准。
      </SettingsHint>
    </SettingsSection>
  );
}
