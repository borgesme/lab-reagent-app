import { apiRequest } from '../request';

export interface CreateRequestDto {
  reagentId: string;
  stockId: string;
  quantity: string;
  unit: string;
  purpose: string;
  projectRef?: string;
  useLocation?: string;
}

export interface DecideRequestDto {
  action: 'APPROVE' | 'REJECT';
  level?: 1 | 2;
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
