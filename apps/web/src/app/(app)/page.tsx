'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  FileText,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/data/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

const ZERO: Kpi = { pendingApprovals: 0, myRequests: 0, stockAlerts: 0, controlledReagents: 0 };

export default function DashboardPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [kpi, setKpi] = useState<Kpi>(ZERO);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([
      apiFetch<any[]>('/requests?status=PENDING', { token }),
      apiFetch<any[]>('/requests?mine=1', { token }),
      apiFetch<any[]>('/alerts/active', { token }),
      apiFetch<any[]>('/reagents?controlled=1', { token }),
    ]).then(([a, b, c, d]) => {
      setKpi({
        pendingApprovals: a.status === 'fulfilled' ? a.value.length : 0,
        myRequests: b.status === 'fulfilled' ? b.value.length : 0,
        stockAlerts: c.status === 'fulfilled' ? c.value.length : 0,
        controlledReagents: d.status === 'fulfilled' ? d.value.length : 0,
      });
    });
  }, [token]);

  const cards: Array<{ label: string; value: number; href: string; icon: React.ReactNode }> = [
    { label: '待我审批', value: kpi.pendingApprovals, href: '/approvals', icon: <CheckSquare className="h-5 w-5 text-primary" /> },
    { label: '我的申请', value: kpi.myRequests, href: '/my/requests', icon: <FileText className="h-5 w-5 text-primary" /> },
    { label: '库存预警', value: kpi.stockAlerts, href: '/admin/alerts/config', icon: <AlertTriangle className="h-5 w-5 text-destructive" /> },
    { label: '管控试剂', value: kpi.controlledReagents, href: '/reagents', icon: <ShieldAlert className="h-5 w-5 text-primary" /> },
  ];

  return (
    <div>
      <PageHeader title="工作台" subtitle="实验室试剂管理中心" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{c.value}</div>
              <Link
                href={c.href}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                查看 <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>快捷入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/reagents">试剂百科</Link></Button>
          <Button asChild variant="outline"><Link href="/my/requests">提交申请</Link></Button>
          <Button asChild variant="outline"><Link href="/approvals">待审批</Link></Button>
          <Button asChild variant="outline"><Link href="/reports/usage-trend">报表中心</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
