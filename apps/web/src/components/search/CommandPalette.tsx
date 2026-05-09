'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Lucide from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, flatNavItems, type IconName } from '@/lib/nav';
import { apiFetch } from '@/lib/api-client';
import type { RoleCode } from '@app/shared';

interface ReagentHit {
  id: string;
  name: string;
  cas?: string | null;
  hazardLevel?: string;
  controlType?: string | null;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = (Lucide as any)[name] as React.ComponentType<{ className?: string }>;
  return C ? <C className={className} /> : null;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const token = useAuth((s) => s.tokens?.accessToken);
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<ReagentHit[]>([]);
  const [searchError, setSearchError] = React.useState(false);

  const navItems = React.useMemo(
    () => flatNavItems(filterNavByRoles(NAV, userRoles)),
    [userRoles],
  );

  React.useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSearchError(false);
      return;
    }
    if (!token) return;
    const handle = setTimeout(() => {
      apiFetch<ReagentHit[]>(
        `/reagents?q=${encodeURIComponent(query)}`,
        { token },
      )
        .then((data) => {
          setHits(data);
          setSearchError(false);
        })
        .catch(() => {
          setHits([]);
          setSearchError(true);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, token]);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function go(href: string) {
    router.push(href);
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="搜索导航或试剂…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>无结果</CommandEmpty>
        <CommandGroup heading="导航">
          {navItems.map((it) => (
            <CommandItem
              key={it.href}
              value={`${it.groupLabel} ${it.label} ${it.href}`}
              onSelect={() => go(it.href)}
            >
              <Icon name={it.icon} className="mr-2 h-4 w-4" />
              <span>{it.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {it.groupLabel}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        {query.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="试剂">
              {searchError && <CommandEmpty>搜索失败</CommandEmpty>}
              {!searchError && hits.length === 0 && (
                <CommandEmpty>无匹配试剂</CommandEmpty>
              )}
              {hits.map((r) => {
                const ctrl =
                  r.hazardLevel === 'CONTROLLED' || !!r.controlType;
                return (
                  <CommandItem
                    key={r.id}
                    value={`${r.name} ${r.cas ?? ''}`}
                    onSelect={() => go(`/reagents?id=${r.id}`)}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.cas && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {r.cas}
                      </span>
                    )}
                    {ctrl && (
                      <Badge variant="destructive" className="ml-auto">
                        {r.controlType ?? r.hazardLevel}
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
