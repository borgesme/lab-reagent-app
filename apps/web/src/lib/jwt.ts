export function decodeJwtPayload<T = Record<string, any>>(
  token: string,
): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const fullyPadded = padded.padEnd(
      Math.ceil(padded.length / 4) * 4,
      '=',
    );
    const json =
      typeof atob === 'function'
        ? atob(fullyPadded)
        : Buffer.from(fullyPadded, 'base64').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
