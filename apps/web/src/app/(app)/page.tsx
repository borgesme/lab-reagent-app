'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  FileText,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/lib/use-api-query';

interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

const ZERO: Kpi = {
  pendingApprovals: 0,
  myRequests: 0,
  stockAlerts: 0,
  controlledReagents: 0,
};

export default function DashboardPage() {
  const kpiQuery = useApiQuery<Kpi>('/dashboard/kpi', {
    queryKey: ['dashboard', 'kpi'],
    retry: false,
  });
  const kpi = kpiQuery.data ?? ZERO;

  useEffect(() => {
    if (kpiQuery.error) {
      toast.error((kpiQuery.error as Error).message ?? '加载工作台失败');
    }
  }, [kpiQuery.error]);

  const cards: Array<{
    label: string;
    value: number;
    href: string;
    icon: React.ReactNode;
  }> = [
    {
      label: '待我审批',
      value: kpi.pendingApprovals,
      href: '/approvals',
      icon: <CheckSquare className="h-5 w-5 text-primary" />,
    },
    {
      label: '我的申请',
      value: kpi.myRequests,
      href: '/my/requests',
      icon: <FileText className="h-5 w-5 text-primary" />,
    },
    {
      label: '库存预警',
      value: kpi.stockAlerts,
      href: '/admin/alerts/config',
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
    },
    {
      label: '管控试剂',
      value: kpi.controlledReagents,
      href: '/reagents',
      icon: <ShieldAlert className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="工作台" subtitle="实验室试剂管理中心" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} data-testid={`dashboard-kpi-${c.label}`}>
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
          <Button asChild variant="outline">
            <Link href="/reagents">试剂百科</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/my/requests">提交申请</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/approvals">待审批</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reports/usage-trend">报表中心</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
