import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from '../jwt';

function b64url(obj: any) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function fakeJwt(payload: any) {
  return `header.${b64url(payload)}.sig`;
}

describe('decodeJwtPayload', () => {
  it('legacy token (no ver) → payload.ver === undefined', () => {
    const t = fakeJwt({ sub: 'u1', roles: ['SYS_ADMIN'] });
    const p = decodeJwtPayload<{ ver?: number }>(t);
    expect(p).toBeTruthy();
    expect(p!.ver).toBeUndefined();
  });

  it('new token (with ver) → payload.ver defined', () => {
    const t = fakeJwt({ sub: 'u1', roles: ['SYS_ADMIN'], ver: 3 });
    const p = decodeJwtPayload<{ ver?: number }>(t);
    expect(p!.ver).toBe(3);
  });

  it('malformed token → null', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('a.@@@.c')).toBeNull();
  });
});
