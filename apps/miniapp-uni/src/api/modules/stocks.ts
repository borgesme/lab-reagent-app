import { apiRequest } from '../request';

export interface QueryStocksParams {
  reagentId?: string;
  labId?: string;
}

function qs(o: Record<string, any>) {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function list(params: QueryStocksParams = {}) {
  return apiRequest<any[]>(`/stocks${qs(params)}`);
}
