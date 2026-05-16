import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from '@/utils/jwt';
import { ApiError } from '@/api/api-error';

const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInZlciI6M30.sig';
const LEGACY_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.sig';

describe('decodeJwtPayload', () => {
  it('正常 token 拿到 sub + ver', () => {
    const payload = decodeJwtPayload<{ sub: string; ver?: number }>(VALID_TOKEN);
    expect(payload?.sub).toBe('u1');
    expect(payload?.ver).toBe(3);
  });

  it('legacy token（缺 ver）拿到 sub，ver=undefined', () => {
    const payload = decodeJwtPayload<{ sub: string; ver?: number }>(LEGACY_TOKEN);
    expect(payload?.sub).toBe('u1');
    expect(payload?.ver).toBeUndefined();
  });

  it('非法 token 返回 null', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('ApiError', () => {
  it('携带 code + message', () => {
    const e = new ApiError(403, '会话已失效');
    expect(e.code).toBe(403);
    expect(e.message).toBe('会话已失效');
    expect(e.name).toBe('ApiError');
  });
});
