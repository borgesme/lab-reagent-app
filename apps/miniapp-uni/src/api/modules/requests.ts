import { apiRequest } from '../request';

export interface CreateRequestDto {
  reagentId: string;
  amount: number;
  unit: string;
  reason?: string;
}

export interface DecideRequestDto {
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

export function listMine() {
  return apiRequest<any[]>('/requests');
}

export function listPending() {
  return apiRequest<any[]>('/requests?status=PENDING');
}

export function create(dto: CreateRequestDto) {
  return apiRequest<any>('/requests', { method: 'POST', data: dto });
}

export function cancel(id: string) {
  return apiRequest<void>(`/requests/${id}/cancel`, { method: 'POST' });
}

export function decide(id: string, dto: DecideRequestDto) {
  return apiRequest<any>(`/requests/${id}/approvals`, { method: 'POST', data: dto });
}
