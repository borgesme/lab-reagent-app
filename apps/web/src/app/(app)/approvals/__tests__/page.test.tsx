import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from '../page';
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

const pendingFixture = [
  {
    id: 'rq-1',
    quantity: '10',
    unit: 'mL',
    purpose: '萃取',
    createdAt: '2026-05-10T08:00:00Z',
    reagent: { name: '乙醇', hazardLevel: 'NORMAL', controlType: null },
    stock: { batchNo: 'B-1' },
    applicant: { name: '张三', email: 'z@lab.local' },
  },
  {
    id: 'rq-2',
    quantity: '5',
    unit: 'mL',
    purpose: '管控用途详述',
    createdAt: '2026-05-11T09:00:00Z',
    reagent: { name: '甲苯', hazardLevel: 'CONTROLLED', controlType: '易制毒' },
    stock: { batchNo: 'B-2' },
    applicant: { name: '李四', email: 'l@lab.local' },
    projectRef: 'P-9',
    useLocation: '实验楼B-301',
  },
];

describe('/approvals page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'approver', email: 'a@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/requests?status=PENDING' && !opts?.method)
        return pendingFixture;
      if (opts?.method === 'POST' && path.endsWith('/approvals')) return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });
  });

  it('渲染待审批列表 + 管控试剂显示二审按钮 + 普通试剂不显示', async () => {
    render(<ApprovalsPage />);
    await waitFor(() => screen.getByText('乙醇'));
    expect(screen.getByText('甲苯')).toBeInTheDocument();
    expect(screen.getByText('管控')).toBeInTheDocument();

    expect(
      screen.getByTestId('approvals-tier1-approve-rq-1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('approvals-tier2-approve-rq-1'),
    ).not.toBeInTheDocument();

    expect(
      screen.getByTestId('approvals-tier2-approve-rq-2'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('approvals-tier2-reject-rq-2'),
    ).toBeInTheDocument();
  });

  it('一审通过 → POST /requests/{id}/approvals body action=APPROVE level=1', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApprovalsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('approvals-tier1-approve-rq-1'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' && c[0] === '/requests/rq-1/approvals',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({ action: 'APPROVE', level: 1 });
      expect(toast.success as any).toHaveBeenCalledWith('一审通过');
    });
  });

  it('一审拒绝 + 批注 → body.comment 传递', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApprovalsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.type(
      screen.getByTestId('approvals-comment-rq-1'),
      '试剂规格不符',
    );
    await user.click(screen.getByTestId('approvals-tier1-reject-rq-1'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' && c[0] === '/requests/rq-1/approvals',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        action: 'REJECT',
        level: 1,
        comment: '试剂规格不符',
      });
    });
  });

  it('二审拒绝失败 → toast.error', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/requests?status=PENDING' && !opts?.method)
        return pendingFixture;
      if (opts?.method === 'POST' && path.endsWith('/approvals'))
        throw new Error('API 409: 已被处理');
      throw new Error('unmocked');
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApprovalsPage />);
    await waitFor(() => screen.getByText('甲苯'));

    await user.click(screen.getByTestId('approvals-tier2-reject-rq-2'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
    });
  });
});
