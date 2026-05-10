'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-store';

export interface UseApiQueryOptions<T> {
  /** 显式 key 段。默认 [path, params]。 */
  queryKey?: readonly unknown[];
  /** query string params。null/undefined/'' 自动跳过。 */
  params?: Record<string, string | number | undefined | null>;
  enabled?: boolean;
  staleTime?: number;
  retry?: UseQueryOptions<T>['retry'];
}

function buildPath(path: string, params?: UseApiQueryOptions<any>['params']) {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function useApiQuery<T>(
  path: string,
  opts: UseApiQueryOptions<T> = {},
) {
  const token = useAuth((s) => s.tokens?.accessToken);
  const fullPath = buildPath(path, opts.params);
  return useQuery<T>({
    queryKey: opts.queryKey ?? [path, opts.params],
    enabled: !!token && (opts.enabled ?? true),
    staleTime: opts.staleTime ?? 30_000,
    retry: opts.retry ?? 1,
    queryFn: () => apiFetch<T>(fullPath, { token }),
  });
}
