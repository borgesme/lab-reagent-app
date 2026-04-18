const BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
