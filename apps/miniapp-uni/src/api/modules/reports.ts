import { apiRequest } from '../request';

export interface UsageTrendQuery {
  range?: string;
  summary?: 0 | 1;
}

export interface InventoryTurnoverQuery {
  range?: string;
  summary?: 0 | 1;
}

export interface PurchaseAmountQuery {
  range?: string;
  groupBy?: 'day' | 'week' | 'month';
  summary?: 0 | 1;
}

function qs(o: Record<string, any>) {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function usageTrend(query: UsageTrendQuery = {}) {
  return apiRequest<any>(`/reports/usage-trend${qs(query)}`);
}

export function inventoryTurnover(query: InventoryTurnoverQuery = {}) {
  return apiRequest<any>(`/reports/inventory-turnover${qs(query)}`);
}

export function purchaseAmount(query: PurchaseAmountQuery = {}) {
  return apiRequest<any>(`/reports/purchase-amount${qs(query)}`);
}
