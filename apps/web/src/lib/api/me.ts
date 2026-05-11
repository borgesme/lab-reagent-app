import type { UserSummary } from '@app/shared';
import { apiFetch } from '../api-client';

export function updateMyProfile(input: { name: string }, token: string) {
  return apiFetch<UserSummary>('/auth/me', {
    method: 'PATCH',
    token,
    body: input,
  });
}
