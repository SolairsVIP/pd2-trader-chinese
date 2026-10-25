import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Search, Loader2, AlertTriangle, CircleAlert } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { fadeIn, fadeInUp } from '@/lib/motion';

interface LoadingAndErrorStatesProps {
  isLoading: boolean;
  error: string | null;
  matchingItems: unknown[];
  onRetry: () => void;
  isAccountMismatch?: boolean;
}

const LoadingAndErrorStates: React.FC<LoadingAndErrorStatesProps> = ({
  isLoading,
  error,
  matchingItems,
  onRetry,
  isAccountMismatch = false,
}) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <motion.div
          key="loading"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3"
          aria-busy
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>正在搜索物品…</span>
          </div>
          {[0, 1].map((i) => (
            <div key={i}
              className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="mt-3 space-y-1.5 pl-6">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </motion.div>
      );
    }

    if (error) {
      return (
        <motion.div key="error"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="w-full">
          {isAccountMismatch ? (
            <Alert variant="destructive"
              className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>检测到账号不匹配</AlertTitle>
              <AlertDescription className="text-xs mt-1 space-y-2">
                <p>
                  你可能登录的是游戏内账号，而不是网站账号。请退出登录，再使用正确的账号重新登录。
                </p>
                <p>
                  <strong>重要：</strong>重新登录前，请先清除此网站的浏览器 Cookie：{' '}
                  <span className="rounded bg-destructive/10 px-1 font-mono">api.projectdiablo2.com</span>；
                  否则系统会自动恢复到当前会话。
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mb-4 flex flex-col items-center gap-2 py-4 text-center"
              role="alert">
              <span className="flex size-10 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <CircleAlert className="size-5" />
              </span>
              <div className="text-sm font-semibold">发生错误</div>
              <div className="max-w-sm text-xs text-destructive">{error}</div>
            </div>
          )}
          <Button onClick={onRetry}
            className="w-full">
            <Search className="h-4 w-4" />
            重试搜索
          </Button>
        </motion.div>
      );
    }

    return null;
  };

  const content = renderContent();

  if (!content && matchingItems.length === 0) {
    return null; // Let parent handle empty state
  }

  return content;
};

export default LoadingAndErrorStates;
