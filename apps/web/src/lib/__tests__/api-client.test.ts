import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api-client';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches bearer token when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/health', { token: 'abc' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer abc');
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('err', { status: 401 })),
    );
    await expect(apiFetch('/x')).rejects.toThrow();
  });
});
