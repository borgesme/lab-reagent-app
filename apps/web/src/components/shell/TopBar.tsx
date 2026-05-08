'use client';
import Link from 'next/link';
import { FlaskConical, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { NotificationBell } from '@/components/NotificationBell';

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
        <span>LabReagent</span>
      </Link>
      <div className="ml-4 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            disabled
            placeholder="搜索（即将上线）"
            className="pl-8"
            aria-label="全局搜索"
          />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
