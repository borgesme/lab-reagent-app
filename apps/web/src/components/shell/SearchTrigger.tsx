'use client';
import * as React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SearchTriggerProps {
  onOpen: () => void;
  className?: string;
}

export function SearchTrigger({ onOpen, className }: SearchTriggerProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpen]);

  return (
    <>
      {/* 桌面端 ≥ md：仿输入框样式按钮 */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent md:inline-flex',
          className,
        )}
        data-testid="search-trigger"
        aria-label="全局搜索"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">搜索导航或试剂…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      {/* 移动端 < md：图标按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        className="md:hidden"
        aria-label="全局搜索"
      >
        <Search className="h-5 w-5" />
      </Button>
    </>
  );
}
