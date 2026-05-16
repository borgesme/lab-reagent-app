function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad !== 0) return '';
  if (typeof atob === 'function') return atob(s);
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('binary');
  return '';
}

export function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const raw = base64UrlDecode(payload);
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(raw))) as T;
  } catch {
    return null;
  }
}
