import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import * as authApi from '@/api/modules/auth';
import * as reagentsApi from '@/api/modules/reagents';
import * as requestsApi from '@/api/modules/requests';
import * as purchasesApi from '@/api/modules/purchases';
import * as notificationsApi from '@/api/modules/notifications';
import * as reportsApi from '@/api/modules/reports';

function captureRequest() {
  const calls: any[] = [];
  (uni.request as any).mockImplementation((opts: any) => {
    calls.push(opts);
    opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: null } });
  });
  return calls;
}

beforeEach(() => {
  setActivePinia(pinia);
  (uni.request as any).mockReset();
});

describe('api/modules path + method 契约', () => {
  it('auth.login POST /auth/login', async () => {
    const calls = captureRequest();
    await authApi.login({ email: 'a@b.c', password: 'x' });
    expect(calls[0].url).toMatch(/\/auth\/login$/);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].data).toEqual({ email: 'a@b.c', password: 'x' });
  });

  it('reagents.list GET /reagents?q=', async () => {
    const calls = captureRequest();
    await reagentsApi.list('h2o');
    expect(calls[0].url).toMatch(/\/reagents\?q=h2o$/);
    expect(calls[0].method).toBe('GET');
  });

  it('requests.decide POST /requests/:id/approvals', async () => {
    const calls = captureRequest();
    await requestsApi.decide('req-1', { action: 'APPROVE', level: 1 });
    expect(calls[0].url).toMatch(/\/requests\/req-1\/approvals$/);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].data.action).toBe('APPROVE');
    expect(calls[0].data.level).toBe(1);
  });

  it('purchases.decideBatch POST /purchases/batches/:id/approve', async () => {
    const calls = captureRequest();
    await purchasesApi.decideBatch('b-1', { action: 'REJECT', comment: '不行' });
    expect(calls[0].url).toMatch(/\/purchases\/batches\/b-1\/approve$/);
    expect(calls[0].data.action).toBe('REJECT');
  });

  it('notifications.readAll POST /notifications/read-all', async () => {
    const calls = captureRequest();
    await notificationsApi.readAll();
    expect(calls[0].url).toMatch(/\/notifications\/read-all$/);
    expect(calls[0].method).toBe('POST');
  });

  it('reports.purchaseAmount 拼 query string', async () => {
    const calls = captureRequest();
    await reportsApi.purchaseAmount({ range: 'month', groupBy: 'month', summary: 1 });
    expect(calls[0].url).toMatch(/\/reports\/purchase-amount\?range=month&groupBy=month&summary=1$/);
  });
});
