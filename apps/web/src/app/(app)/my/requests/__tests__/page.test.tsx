import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyRequestsPage from '../page';
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

const reagentsFixture = [
  { id: 'r1', name: '乙醇', hazardLevel: 'NORMAL' as const },
  {
    id: 'r2',
    name: '甲苯',
    hazardLevel: 'CONTROLLED' as const,
    controlType: '易制毒',
  },
];
const stocksFixture = [
  {
    id: 'st-1',
    batchNo: 'B-1',
    currentQty: '100',
    unit: 'mL',
    reagent: { id: 'r1', name: '乙醇' },
  },
  {
    id: 'st-2',
    batchNo: 'B-2',
    currentQty: '50',
    unit: 'mL',
    reagent: { id: 'r2', name: '甲苯' },
  },
];
const myRequestsFixture = [
  {
    id: 'rq-1',
    status: 'PENDING',
    quantity: '10',
    unit: 'mL',
    purpose: '反应',
    createdAt: '2026-05-10T08:00:00Z',
    reagent: { name: '乙醇', hazardLevel: 'NORMAL' as const, controlType: null },
    stock: { batchNo: 'B-1' },
  },
];

function setupHappy() {
  mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
    if (path === '/requests' && !opts?.method) return myRequestsFixture;
    if (path === '/reagents' && !opts?.method) return reagentsFixture;
    if (path === '/stocks' && !opts?.method) return stocksFixture;
    if (opts?.method === 'POST' && path === '/requests') return { id: 'rq-2' };
    if (opts?.method === 'POST' && path.endsWith('/cancel')) return { ok: true };
    throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
  });
}

describe('/my/requests page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'u1', email: 'u@lab.local' } as any,
      hydrated: true,
    });
    setupHappy();
  });

  it('渲染申请列表 + PENDING 显示操作菜单', async () => {
    render(<MyRequestsPage />);
    await waitFor(() => screen.getByText('反应'));
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '操作' }),
    ).toBeInTheDocument();
  });

  it('提交普通试剂申请 → POST /requests + 字段映射', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<MyRequestsPage />);
    await waitFor(() => screen.getByText('反应'));

    await user.click(screen.getByTestId('my-requests-add'));

    await user.click(screen.getByTestId('my-requests-form-reagent'));
    await user.click(await screen.findByRole('option', { name: '乙醇' }));
    await user.click(screen.getByTestId('my-requests-form-stock'));
    await user.click(
      await screen.findByRole('option', { name: /B-1 · 余 100mL/ }),
    );

    await user.type(screen.getByTestId('my-requests-form-qty'), '5');
    await user.type(screen.getByTestId('my-requests-form-purpose'), '萃取实验');

    await user.click(screen.getByTestId('my-requests-form-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/requests',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        reagentId: 'r1',
        stockId: 'st-1',
        quantity: '5',
        unit: 'mL',
        purpose: '萃取实验',
      });
    });
  });

  it('管控试剂用途 <50 字 → 校验失败 不发请求', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<MyRequestsPage />);
    await waitFor(() => screen.getByText('反应'));

    await user.click(screen.getByTestId('my-requests-add'));

    await user.click(screen.getByTestId('my-requests-form-reagent'));
    await user.click(await screen.findByRole('option', { name: /甲苯/ }));
    await user.click(screen.getByTestId('my-requests-form-stock'));
    await user.click(
      await screen.findByRole('option', { name: /B-2 · 余 50mL/ }),
    );

    await user.type(screen.getByTestId('my-requests-form-qty'), '5');
    await user.type(screen.getByTestId('my-requests-form-purpose'), '太短');

    await user.click(screen.getByTestId('my-requests-form-submit'));

    await waitFor(() => {
      expect(screen.getByText('管控试剂用途需 ≥50 字')).toBeInTheDocument();
    });
    const postCall = mockApiFetch.mock.calls.find(
      (c) => c[1]?.method === 'POST' && c[0] === '/requests',
    );
    expect(postCall).toBeUndefined();
  });

  it('取消 PENDING 申请 → POST /requests/{id}/cancel + toast', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<MyRequestsPage />);
    await waitFor(() => screen.getByText('反应'));

    await user.click(screen.getByRole('button', { name: '操作' }));
    await user.click(screen.getByRole('menuitem', { name: '取消申请' }));

    await user.click(screen.getByTestId('my-requests-cancel-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/requests/rq-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(toast.success as any).toHaveBeenCalledWith('已取消');
    });
  });
});
