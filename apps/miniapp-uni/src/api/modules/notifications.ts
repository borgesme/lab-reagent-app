import { apiRequest } from '../request';

export function list(unreadOnly?: boolean) {
  const path = unreadOnly ? '/notifications?unreadOnly=true' : '/notifications';
  return apiRequest<any[]>(path);
}

export function read(id: string) {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' });
}

export function readAll() {
  return apiRequest<void>('/notifications/read-all', { method: 'POST' });
}
