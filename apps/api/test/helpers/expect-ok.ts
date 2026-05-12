import type { Response as SupertestResponse } from 'supertest';

type Matcher<T> = Partial<T> | ((data: T) => void);

export function expectOk<T = any>(
  res: SupertestResponse,
  matcher?: Matcher<T>,
): T {
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(200);
  expect(res.body.msg).toBeDefined();
  if (matcher !== undefined) {
    if (typeof matcher === 'function') {
      (matcher as (d: T) => void)(res.body.data as T);
    } else {
      expect(res.body.data).toMatchObject(matcher as object);
    }
  }
  return res.body.data as T;
}

export function expectBizError(
  res: SupertestResponse,
  code: number,
  msgMatch?: string | RegExp,
): void {
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(code);
  expect(res.body.data).toBeNull();
  if (msgMatch !== undefined) {
    if (typeof msgMatch === 'string') expect(res.body.msg).toContain(msgMatch);
    else expect(res.body.msg).toMatch(msgMatch);
  }
}
