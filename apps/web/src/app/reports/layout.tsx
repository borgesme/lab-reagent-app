'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-store';
import {
  REPORT_SCOPE_MATRIX,
  type ReportType,
  type RoleCode,
} from '@app/shared';

const NAV: Array<{ slug: ReportType; label: string }> = [
  { slug: 'usage-trend', label: '领用趋势' },
  { slug: 'inventory-turnover', label: '库存周转' },
  { slug: 'purchase-amount', label: '采购金额' },
  { slug: 'controlled-audit', label: '管控审计' },
];

function visibleSlugs(roles: RoleCode[]): Set<ReportType> {
  const set = new Set<ReportType>();
  for (const role of roles) {
    const row = REPORT_SCOPE_MATRIX[role];
    if (!row) continue;
    for (const slug of NAV.map((n) => n.slug)) {
      if (row[slug] != null) set.add(slug);
    }
  }
  return set;
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const pathname = usePathname();
  const allowed = visibleSlugs((user?.roles ?? []) as RoleCode[]);

  return (
    <RequireAuth>
      <div className="flex min-h-screen">
        <aside className="w-48 space-y-2 bg-gray-100 p-4">
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">
            报表中心
          </div>
          {NAV.filter((n) => allowed.has(n.slug)).map((n) => {
            const active = pathname?.startsWith(`/reports/${n.slug}`);
            return (
              <Link
                key={n.slug}
                href={`/reports/${n.slug}`}
                className={`block rounded px-2 py-1 ${
                  active ? 'bg-white font-semibold' : ''
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
