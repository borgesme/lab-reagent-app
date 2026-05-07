'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export interface UseReportDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useReportData<T>(
  path: string,
  params: Record<string, string | undefined>,
): UseReportDataState<T> {
  const tokens = useAuth((s) => s.tokens);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dep = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    if (!tokens) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.append(k, v);
    }
    apiFetch<T>(`${path}?${qs.toString()}`, { token: tokens.accessToken })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, dep, tokens?.accessToken]);

  return { data, loading, error };
}
