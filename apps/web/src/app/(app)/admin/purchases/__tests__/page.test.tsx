import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPurchasesPage from '../page';
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

const pendingPurchases = [
  {
    id: 'pr-1',
    status: 'PENDING',
    applicantId: 'u1',
    reagentId: 'r1',
    quantity: '10',
    unit: 'mL',
    reason: '实验用',
    reagent: { id: 'r1', name: '乙醇' },
    applicant: { id: 'u1', name: '张三', email: 'z@lab' },
    batch: null,
  },
  {
    id: 'pr-2',
    status: 'PENDING',
    applicantId: 'u2',
    reagentId: 'r2',
    quantity: '5',
    unit: 'g',
    reason: '研究',
    reagent: { id: 'r2', name: '盐酸' },
    applicant: { id: 'u2', name: '李四', email: 'l@lab' },
    batch: null,
  },
];
const approvedWithBatch = {
  id: 'pr-3',
  status: 'BATCHED',
  applicantId: 'u3',
  reagentId: 'r1',
  quantity: '20',
  unit: 'mL',
  reason: 'x',
  reagent: { id: 'r1', name: '乙醇' },
  applicant: { id: 'u3', name: '王五', email: 'w@lab' },
  batch: {
    id: 'batch-abc12345',
    reagentId: 'r1',
    totalQty: '20',
    unit: 'mL',
    status: 'APPROVED',
  },
};

describe('/admin/purchases page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases' && !opts?.method)
        return [...pendingPurchases, approvedWithBatch];
      if (opts?.method === 'POST' && path === '/purchases/batches')
        return { id: 'batch-new' };
      if (opts?.method === 'POST' && path.endsWith('/receipt'))
        return { ok: true };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });
  });

  it('渲染待合并 + 批次两个表', async () => {
    render(<AdminPurchasesPage />);
    await waitFor(() => screen.getByText('张三'));
    expect(screen.getByText('盐酸')).toBeInTheDocument();
    expect(screen.getByText(/batch-ab/)).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('勾选 + 合并 → POST /purchases/batches body.requestIds', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AdminPurchasesPage />);
    await waitFor(() => screen.getByText('张三'));

    await user.click(screen.getAllByRole('checkbox', { name: '选择' })[0]);
    await user.click(screen.getAllByRole('checkbox', { name: '选择' })[1]);

    await user.click(screen.getByTestId('admin-purchases-merge'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/purchases/batches',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body.requestIds).toEqual(
        expect.arrayContaining(['pr-1', 'pr-2']),
      );
      expect(postCall![1].body.requestIds).toHaveLength(2);
    });
  });

  it('合并失败 → toast.error', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases' && !opts?.method)
        return [...pendingPurchases, approvedWithBatch];
      if (opts?.method === 'POST' && path === '/purchases/batches')
        throw new Error('API 422: 重复合并');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AdminPurchasesPage />);
    await waitFor(() => screen.getByText('张三'));

    const checkboxes = screen.getAllByRole('checkbox', { name: '选择' });
    await user.click(checkboxes[0]);
    await user.click(screen.getByTestId('admin-purchases-merge'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
    });
  });

  it('APPROVED 批次点入库 → POST /purchases/batches/{id}/receipt', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AdminPurchasesPage />);
    await waitFor(() => screen.getByText(/batch-ab/));

    await user.click(screen.getByRole('button', { name: '入库' }));

    await user.type(screen.getByLabelText('实收数量'), '20');
    await user.type(screen.getByLabelText('批号'), 'B-RX');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' &&
          c[0] === '/purchases/batches/batch-abc12345/receipt',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toMatchObject({
        actualQty: '20',
        batchNo: 'B-RX',
      });
    });
  });
});
