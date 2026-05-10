'use client';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/data/ErrorState';
import { EmptyState } from '@/components/data/EmptyState';

export interface ChartCardProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  testId?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  loading,
  error,
  empty,
  testId,
  children,
}: ChartCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : error ? (
          <ErrorState message={error} />
        ) : empty ? (
          <EmptyState title="暂无数据" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
