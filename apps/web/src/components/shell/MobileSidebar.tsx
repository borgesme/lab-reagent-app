'use client';
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, type IconName } from '@/lib/nav';
import { ICONS } from '@/lib/nav-icons';
import type { RoleCode } from '@app/shared';
import { cn } from '@/lib/utils';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return C ? <C className={className} /> : null;
}

export interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const groups = filterNavByRoles(NAV, userRoles);

  function handleNavigate(e: React.MouseEvent, href: string) {
    e.preventDefault();
    router.push(href);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-left">导航</SheetTitle>
        </SheetHeader>
        <nav className="overflow-y-auto p-3" data-testid="mobile-nav">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const active =
                    pathname === it.href || pathname.startsWith(it.href + '/');
                  return (
                    <li key={it.href}>
                      <a
                        href={it.href}
                        onClick={(e) => handleNavigate(e, it.href)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                          active
                            ? 'bg-accent font-medium text-primary'
                            : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                        <span>{it.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
