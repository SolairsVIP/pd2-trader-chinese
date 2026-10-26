import { useEffect, useState } from 'react';
import { useOptions } from '@/hooks/useOptions';
import imgPath from '../../../../assets/img.png';
import { getVersion } from '@/lib/browser-app';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';
import { springSoft } from '@/lib/motion';
import { useOverlay } from '@/overlay';
import { SettingsSkeleton } from '../settings-ui';

export function AboutForm() {
  const { settings, isLoading } = useOptions();
  const [version, setVersion] = useState<string | null>(null);
  const { openPanel } = useOverlay();

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  if (isLoading || !settings) {
    return <SettingsSkeleton rows={1} />;
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-lg border border-border/70 bg-card/50 px-6 py-8 text-center shadow-xs">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-72 rounded-full bg-primary/15 blur-3xl"
        />
        <motion.img
          src={imgPath}
          alt="PD2 Trader 标志"
          width={56}
          height={56}
          className="relative drop-shadow-lg"
          initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={springSoft}
        />
        <div className="relative flex flex-col items-center gap-1.5">
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: 'DiabloFont' }}>
            PD2 Trader 中文版
          </span>
          {version ? (
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
              版本：{version}
            </span>
          ) : (
            <Skeleton className="h-5 w-28 rounded-full" />
          )}
        </div>
        <div className="relative mt-2 flex w-full max-w-xs flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => openPanel('changeLog')} className="w-full">
            <FileText className="h-4 w-4" />
            查看更新日志
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <CreditTile role="中文版开发者" names={['Solaris']} />
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">致谢：</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CreditTile role="原版开发者" names={['@Doreet']} />
            <CreditTile role="腐化区提示原作者" names={['Blyat']} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditTile({ role, names }: { role: string; names: string[] }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/70 bg-card/50 px-4 py-3 text-center shadow-xs">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{role}</span>
      {names.map((name) => (
        <span key={name} className="text-sm font-medium text-foreground">
          {name}
        </span>
      ))}
    </div>
  );
}
