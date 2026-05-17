import Storage from '@/utils/storage';

export const TokenKey = 'Uni_App_Token';

const storage = new Storage();

export function getToken(): string | undefined {
  return storage.get<string>(TokenKey);
}

export function setToken(token: string): void {
  storage.set(TokenKey, token);
}

export function removeToken(): void {
  storage.remove(TokenKey);
}
