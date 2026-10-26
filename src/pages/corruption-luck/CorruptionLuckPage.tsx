import { useState } from 'react';
import { WindowChrome } from '@/components/custom/window-chrome';
import { usePanel } from '@/overlay';
import chamber from '@/assets/corruption-luck/chamber.png';
import parcel from '@/assets/corruption-luck/mystery-parcel.png';
import shard from '@/assets/corruption-luck/shard.png';
import { luckResult, rollLuck } from './luck';
import { useLuckSound } from './useLuckSound';
import './corruption-luck.css';

export default function CorruptionLuckPage() {
  const { close, visible } = usePanel<'corruptionLuck'>();
  const sound = useLuckSound(visible);
  const [draw, setDraw] = useState<{ score: number; count: number } | null>(null);
  const result = draw === null ? null : luckResult(draw.score);
  const handleClose = () => {
    sound.stop();
    close();
  };

  return (
    <section className="luck-panel" aria-label="腐化前试试手气">
      <WindowChrome
        title="腐化前试试手气"
        icon={<img src={shard} alt="" className="size-6" />}
        onClose={handleClose}
        className="luck-titlebar"
      />
      <div className="luck-stage">
        <div className="luck-chamber">
          <img src={chamber} alt="" className="luck-backdrop" draggable={false} />
          <div className="luck-reading" role="status" aria-live="polite" aria-atomic="true" data-tier={result?.tier}>
            <span className="luck-eyebrow">腐 化 之 前 · 先 试 手 气</span>
            <div key={draw?.count ?? 'ready'} className="luck-reveal">
              <span className="luck-score">{draw?.score ?? '?'}</span>
              <span className="luck-message">{result?.message ?? '神秘包裹已就位'}</span>
            </div>
            <span className="luck-scale">{draw ? '本次手气 / 100' : '点击下方按钮，看看今天的手气'}</span>
          </div>
          <div className="luck-parcel" aria-label="神秘包裹，占 2×2 格" title="即将腐化的神秘包裹 · 2×2 格">
            <img src={parcel} alt="神秘包裹" draggable={false} />
          </div>
          <button
            type="button"
            className="luck-roll"
            aria-label="试试手气"
            title="试试手气（0–100）"
            onClick={() => {
              const score = rollLuck();
              setDraw((previous) => ({ score, count: (previous?.count ?? 0) + 1 }));
              sound.play(score);
            }}
          />
          <span className="luck-roll-caption">{draw ? '再试一次' : '试试手气'}</span>
          <button type="button" className="luck-close" onClick={handleClose} aria-label="关闭试手气" title="关闭" />
        </div>
      </div>
      <div className="luck-disclaimer">
        <p>仅供娱乐，不影响游戏内腐化结果</p>
        {sound.error && <p role="status">音效暂时无法播放，手气结果不受影响。</p>}
      </div>
    </section>
  );
}
