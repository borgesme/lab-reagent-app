import type { AuthTokens, UserSummary } from '@app/shared';
import { apiRequest } from '../request';

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateMeDto {
  name?: string;
}

export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

export function login(dto: LoginDto) {
  return apiRequest<AuthTokens>('/auth/login', { method: 'POST', data: dto });
}

export function me() {
  return apiRequest<UserSummary>('/auth/me');
}

export function updateMe(dto: UpdateMeDto) {
  return apiRequest<UserSummary>('/auth/me', { method: 'PATCH', data: dto });
}

export function changePassword(dto: ChangePasswordDto) {
  return apiRequest<void>('/auth/change-password', { method: 'POST', data: dto });
}
