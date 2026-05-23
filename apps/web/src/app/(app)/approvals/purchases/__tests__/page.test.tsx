import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PurchaseApprovalsPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => {
  return {
    toast: { success: vi.fn(), error: vi.fn() },
    Toaster: () => null,
  };
});

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

function makeBatch(id: string, status: 'PENDING' | 'APPROVED' = 'PENDING') {
  return {
    id,
    labId: 'lab-1',
    reagentId: 'reag-1',
    totalQty: '100',
    unit: 'g',
    status,
    createdBy: 'admin',
    createdAt: '2026-05-20T00:00:00.000Z',
  };
}

function makeRow(
  id: string,
  batchId: string,
  opts: {
    batchStatus?: 'PENDING' | 'APPROVED';
    applicantName?: string;
    quantity?: string;
  } = {},
) {
  return {
    id,
    applicantId: `user-${id}`,
    labId: 'lab-1',
    reagentId: 'reag-1',
    quantity: opts.quantity ?? '50',
    unit: 'g',
    reason: '日常实验',
    status: 'APPROVED' as const,
    batchId,
    createdAt: '2026-05-20T00:00:00.000Z',
    reagent: { id: 'reag-1', name: '乙醇' },
    applicant: {
      id: `user-${id}`,
      name: opts.applicantName ?? `用户${id}`,
      email: `${id}@lab.local`,
    },
    batch: makeBatch(batchId, opts.batchStatus ?? 'PENDING'),
  };
}

describe('/approvals/purchases page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('空态: apiFetch 返 [] → 显示 "暂无待审批批次"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases') return [];
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<PurchaseApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无待审批批次')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('purchase-approvals-list'),
    ).not.toBeInTheDocument();
  });

  it('分组渲染: 4 条数据 → 2 组 PENDING（APPROVED 被过滤）', async () => {
    const rows = [
      makeRow('p1', 'batch-A', { applicantName: '张三' }),
      makeRow('p2', 'batch-A', { applicantName: '李四' }),
      makeRow('p3', 'batch-B', { applicantName: '王五' }),
      makeRow('p4', 'batch-C', { batchStatus: 'APPROVED' }),
    ];
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases') return rows;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<PurchaseApprovalsPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('purchase-approvals-list'),
      ).toBeInTheDocument();
    });

    // 两组 PENDING 渲染
    expect(
      screen.getByTestId('purchase-approvals-approve-batch-A'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('purchase-approvals-approve-batch-B'),
    ).toBeInTheDocument();
    // APPROVED 那条被过滤
    expect(
      screen.queryByTestId('purchase-approvals-approve-batch-C'),
    ).not.toBeInTheDocument();

    // batch-A 同时含 张三 / 李四
    expect(screen.getByText(/张三/)).toBeInTheDocument();
    expect(screen.getByText(/李四/)).toBeInTheDocument();
    expect(screen.getByText(/王五/)).toBeInTheDocument();
  });

  it('通过成功: 点击 通过 → POST approve + 触发 /purchases refresh', async () => {
    const rows = [makeRow('p1', 'batch-A')];
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases' && (!opts || !opts.method)) return rows;
      if (
        opts?.method === 'POST' &&
        path === '/purchases/batches/batch-A/approve'
      )
        return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<PurchaseApprovalsPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('purchase-approvals-approve-batch-A'),
      ).toBeInTheDocument();
    });

    const before = mockApiFetch.mock.calls.filter(
      (c) => c[0] === '/purchases' && (!c[1] || !c[1].method),
    ).length;

    await user.click(
      screen.getByTestId('purchase-approvals-approve-batch-A'),
    );

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' &&
          c[0] === '/purchases/batches/batch-A/approve',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toEqual({ action: 'APPROVE', comment: '' });
    });

    // refresh 触发后 /purchases 又被调一次
    await waitFor(() => {
      const after = mockApiFetch.mock.calls.filter(
        (c) => c[0] === '/purchases' && (!c[1] || !c[1].method),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('拒绝带 comment: Textarea 输入 → 点 拒绝 → body 含 comment', async () => {
    const rows = [makeRow('p1', 'batch-A')];
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases' && (!opts || !opts.method)) return rows;
      if (
        opts?.method === 'POST' &&
        path === '/purchases/batches/batch-A/approve'
      )
        return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<PurchaseApprovalsPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('purchase-approvals-comment-batch-A'),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByTestId('purchase-approvals-comment-batch-A'),
      '库存充足',
    );
    await user.click(
      screen.getByTestId('purchase-approvals-reject-batch-A'),
    );

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' &&
          c[0] === '/purchases/batches/batch-A/approve',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toEqual({
        action: 'REJECT',
        comment: '库存充足',
      });
    });
  });

  it('decide 失败 → toast.error 被调', async () => {
    const { toast } = await import('sonner');
    const rows = [makeRow('p1', 'batch-A')];
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases' && (!opts || !opts.method)) return rows;
      if (
        opts?.method === 'POST' &&
        path === '/purchases/batches/batch-A/approve'
      )
        throw new Error('API 422: 审批失败');
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<PurchaseApprovalsPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('purchase-approvals-approve-batch-A'),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByTestId('purchase-approvals-approve-batch-A'),
    );

    await waitFor(() => {
      expect(
        (toast.error as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('审批失败'),
        ),
      ).toBe(true);
    });
  });
});
