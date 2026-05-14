import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LedgerPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

const rowsFixture = [
  {
    date: '2026-05-10',
    reagentName: '乙醚',
    batchNo: 'B-1',
    controlType: '易制毒',
    applicant: '张三',
    projectRef: 'P-1',
    purpose: '萃取',
    actualQty: '20',
    unit: 'mL',
    issuer: '李四',
    witness: '王五',
    signed: 'Y' as const,
  },
];
const snapshotsFixture = [
  {
    id: 'snap-1',
    labId: 'lab-1',
    yearMonth: '2026-04',
    rowCount: 12,
    createdAt: '2026-05-01T00:00:00Z',
  },
];

describe('/admin/ledger page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/controlled-ledger/snapshots')) return snapshotsFixture;
      if (path.startsWith('/controlled-ledger?')) return rowsFixture;
      throw new Error(`unmocked GET ${path}`);
    });
  });

  it('渲染台账行 + 历史快照', async () => {
    render(<LedgerPage />);
    await waitFor(() => screen.getByText('乙醚'));
    expect(screen.getByText('2026-04')).toBeInTheDocument();
    expect(screen.getByText(/lab-1.*12 行/)).toBeInTheDocument();

    const ledgerCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith('/controlled-ledger?'),
    );
    expect(ledgerCall).toBeDefined();
    expect(String(ledgerCall![0])).toContain('format=json');
  });

  it('加载失败 → toast.error', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockReset();
    mockApiFetch.mockRejectedValue(new Error('API 500: boom'));
    render(<LedgerPage />);
    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalledWith(
        expect.stringContaining('boom'),
      );
    });
  });

  it('点击快照下载 → 触发 fetch + a.click', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const blob = new Blob(['csv,data'], { type: 'text/csv' });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    });
    (globalThis as any).fetch = fetchSpy;
    (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:dummy');
    (URL as any).revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<LedgerPage />);
    await waitFor(() => screen.getByText('2026-04'));

    const dlBtns = screen.getAllByRole('button', { name: /下载/ });
    const snapshotBtn = dlBtns.find((b) => b.textContent?.trim() === '下载');
    expect(snapshotBtn).toBeDefined();
    await user.click(snapshotBtn!);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/controlled-ledger/snapshots/snap-1'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer tok' },
        }),
      );
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
