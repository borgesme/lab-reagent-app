'use client';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  children: ReactNode;
}

export function ChartCard({ title, loading, error, empty, children }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-medium">{title}</h3>
      {loading && <div className="py-12 text-center text-gray-400">加载中…</div>}
      {!loading && error && (
        <div className="py-12 text-center text-red-600">加载失败:{error}</div>
      )}
      {!loading && !error && empty && (
        <div className="py-12 text-center text-gray-400">暂无数据</div>
      )}
      {!loading && !error && !empty && children}
    </div>
  );
}
