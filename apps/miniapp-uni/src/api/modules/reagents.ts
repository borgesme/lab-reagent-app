import { apiRequest } from '../request';

export function list(q?: string) {
  const path = q ? `/reagents?q=${encodeURIComponent(q)}` : '/reagents';
  return apiRequest<any[]>(path);
}
