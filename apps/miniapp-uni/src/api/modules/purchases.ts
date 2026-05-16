import { apiRequest } from '../request';

export interface CreatePurchaseDto {
  reagentId: string;
  amount: number;
  unit: string;
  reason?: string;
}

export interface DecideBatchDto {
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

export function listMine() {
  return apiRequest<any[]>('/purchases/mine');
}

export function listPending() {
  return apiRequest<any[]>('/purchases');
}

export function create(dto: CreatePurchaseDto) {
  return apiRequest<any>('/purchases', { method: 'POST', data: dto });
}

export function cancel(id: string) {
  return apiRequest<void>(`/purchases/${id}/cancel`, { method: 'POST' });
}

export function decideBatch(batchId: string, dto: DecideBatchDto) {
  return apiRequest<any>(`/purchases/batches/${batchId}/approve`, {
    method: 'POST',
    data: dto,
  });
}
