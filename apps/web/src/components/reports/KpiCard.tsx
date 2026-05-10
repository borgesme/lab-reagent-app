'use client';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
  label: string;
  value?: string | number;
  delta?: number;
  loading?: boolean;
  testId?: string;
}

export function KpiCard({ label, value, delta, loading, testId }: KpiCardProps) {
  const trend = delta == null ? null : delta >= 0 ? 'up' : 'down';
  const trendColor = trend === 'up' ? 'text-emerald-600' : 'text-destructive';

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <span
            className="text-3xl font-semibold tabular-nums"
            data-testid={testId ? testId + '-value' : undefined}
          >
            {value ?? '—'}
          </span>
        )}
        {delta != null && !loading && (
          <div className={cn('mt-1 flex items-center text-xs', trendColor)}>
            {trend === 'up' ? (
              <ArrowUp className="mr-1 h-3 w-3" />
            ) : (
              <ArrowDown className="mr-1 h-3 w-3" />
            )}
            <span className="tabular-nums">
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </span>
            <span className="ml-1 text-muted-foreground">vs 上一周期</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
