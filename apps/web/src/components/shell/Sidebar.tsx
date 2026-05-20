'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Lucide from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, type IconName } from '@/lib/nav';
import type { RoleCode } from '@app/shared';
import { cn } from '@/lib/utils';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = (Lucide as any)[name] as React.ComponentType<{ className?: string }>;
  return C ? <C className={className} /> : null;
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const groups = filterNavByRoles(NAV, userRoles);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background md:block">
      <nav className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + '/');
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-accent font-medium text-primary'
                          : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
