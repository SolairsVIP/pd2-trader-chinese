// @vitest-environment happy-dom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CorruptedZoneCard from './CorruptedZoneCard';

afterEach(cleanup);
const now = Date.parse('2026-10-26T00:00:00Z');

describe('corrupted-zone card', () => {
  it('allows direct damage selection and keeps the countdown visible', () => {
    const change = vi.fn();
    const { rerender } = render(
      <CorruptedZoneCard now={now} expanded damageType="lightning" onDamageChange={change} />,
    );
    expect(screen.getByLabelText('当前刷图建议').textContent).toBe('存在免疫');
    expect(
      screen.getByLabelText('当前刷图建议').compareDocumentPosition(screen.getByLabelText('剩余时间')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '物理' }));
    expect(change).toHaveBeenLastCalledWith('physical');
    fireEvent.click(screen.getByLabelText('切换主要伤害类型'));
    expect(change).toHaveBeenLastCalledWith('cold');
    rerender(<CorruptedZoneCard now={now} expanded={false} damageType="lightning" onDamageChange={change} />);
    expect(screen.getByLabelText('剩余时间').textContent).toBe('15:00');
    expect(screen.queryByRole('group')).toBeNull();
  });
  it('keeps the collapsed display to one thin row with details available in its tooltip', () => {
    render(<CorruptedZoneCard now={now} expanded={false} />);
    expect(screen.getByTitle(/建房时间表预报/).title).toContain('腐化区提示作者：Blyat');
    expect(screen.getByTitle(/建房时间表预报/).title).toContain('下一轮');
    expect(screen.getByLabelText('剩余时间').textContent).toBe('15:00');
    expect(screen.getByText("Nihlathak's Temple")).toBeTruthy();
    expect(screen.queryByText(/每 15 分钟轮换/)).toBeNull();
    expect(screen.queryByText('腐化区提示作者：Blyat')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
  it('shows four future slots only while expanded and lets the user collapse', () => {
    const expand = vi.fn();
    render(<CorruptedZoneCard now={now} expanded onExpand={expand} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('腐化区提示作者：Blyat')).toBeTruthy();
    expect(screen.queryByText('建房时间表预报 · 以游戏公告为准')).toBeNull();
    expect(screen.queryByText('免疫资料：Hiim PD2（社区参考）')).toBeNull();
    expect(screen.queryByText(/社区免疫资料参考，按区域组合汇总/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '收起未来四轮' }));
    expect(expand).toHaveBeenCalledOnce();
  });
  it('provides independent close, reset and appearance actions', () => {
    const close = vi.fn(),
      reset = vi.fn(),
      settings = vi.fn();
    render(<CorruptedZoneCard now={now} expanded={false} onClose={close} onReset={reset} onSettings={settings} />);
    fireEvent.click(screen.getByLabelText('隐藏腐化区提示'));
    fireEvent.click(screen.getByLabelText('恢复顶部居中'));
    fireEvent.click(screen.getByLabelText('腐化区外观设置'));
    expect(close).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(settings).toHaveBeenCalledOnce();
  });
});
