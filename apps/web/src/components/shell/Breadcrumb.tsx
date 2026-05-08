'use client';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { flatNavItems } from '@/lib/nav';

export function Breadcrumb() {
  const pathname = usePathname() ?? '/';
  const flat = flatNavItems();
  const match = flat
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (!match || match.href === '/') return null;

  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <span>{match.groupLabel}</span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <span className="text-foreground">{match.label}</span>
    </nav>
  );
}
