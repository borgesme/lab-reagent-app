import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IssuesPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

vi.mock('react-signature-canvas', () => {
  const React = require('react');
  return {
    default: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        isEmpty: () => false,
        clear: () => {},
        toDataURL: () => 'data:image/png;base64,SIG',
      }));
      return React.createElement('div', { 'data-testid': 'sig-canvas' });
    }),
  };
});

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

const approvedNormal = {
  id: 'rq-n',
  status: 'APPROVED',
  quantity: '10',
  unit: 'mL',
  purpose: '萃取',
  createdAt: '2026-05-10T08:00:00Z',
  reagent: { name: '乙醇', hazardLevel: 'NORMAL', controlType: null },
  stock: { batchNo: 'B-1' },
  applicant: { id: 'u1', name: '张三', email: 'z@lab' },
};
const approvedCtrl = {
  id: 'rq-c',
  status: 'APPROVED',
  quantity: '5',
  unit: 'mL',
  purpose: '管控',
  createdAt: '2026-05-11T09:00:00Z',
  reagent: { name: '甲苯', hazardLevel: 'CONTROLLED', controlType: '易制毒' },
  stock: { batchNo: 'B-2' },
  applicant: { id: 'u2', name: '李四', email: 'l@lab' },
};
const issuedFixture = [
  {
    id: 'rq-i',
    status: 'ISSUED',
    quantity: '20',
    unit: 'g',
    purpose: '已发',
    createdAt: '2026-05-09T08:00:00Z',
    reagent: { name: '氯化钠', hazardLevel: 'NORMAL', controlType: null },
    stock: { batchNo: 'B-X' },
    applicant: { id: 'u3', name: '王五', email: 'w@lab' },
  },
];
const usersFixture = [
  { id: 'wit-1', name: '见证人', email: 'wit@lab' },
];

function setupHappy() {
  mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
    if (path === '/requests?status=APPROVED' && !opts?.method)
      return [approvedNormal, approvedCtrl];
    if (path === '/requests?status=ISSUED' && !opts?.method)
      return issuedFixture;
    if (path === '/users' && !opts?.method) return usersFixture;
    if (opts?.method === 'POST' && path.endsWith('/issues')) return {};
    throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
  });
}

describe('/admin/issues page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    setupHappy();
  });

  it('渲染待发放 + 已发放台账', async () => {
    render(<IssuesPage />);
    await waitFor(() => screen.getByText('乙醇'));
    expect(screen.getByText('甲苯')).toBeInTheDocument();
    expect(screen.getByText('管控')).toBeInTheDocument();
    expect(screen.getByText('氯化钠')).toBeInTheDocument();
  });

  it('普通试剂发放 → POST /requests/{id}/issues body.actualQty (无 witness/signature)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<IssuesPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.type(
      screen.getByTestId('admin-issues-row-rq-n-qty'),
      '9.5',
    );
    await user.click(screen.getByTestId('admin-issues-row-rq-n-issue'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/requests/rq-n/issues',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toEqual({ actualQty: '9.5' });
      expect(post![1].body.witnessId).toBeUndefined();
      expect(post![1].body.signatureDataUrl).toBeUndefined();
    });
  });

  it('管控试剂未选见证人 → toast.error("请选择见证人") 不发请求', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<IssuesPage />);
    await waitFor(() => screen.getByText('甲苯'));

    await user.click(screen.getByTestId('admin-issues-row-rq-c-issue'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalledWith('请选择见证人');
    });
    const post = mockApiFetch.mock.calls.find(
      (c) => c[1]?.method === 'POST' && c[0] === '/requests/rq-c/issues',
    );
    expect(post).toBeUndefined();
  });

  it('管控试剂完整流程 → body 含 witnessId 与 signatureDataUrl', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<IssuesPage />);
    await waitFor(() => screen.getByText('甲苯'));

    const witnessTrigger = screen.getByRole('combobox');
    await user.click(witnessTrigger);
    await user.click(await screen.findByRole('option', { name: /见证人/ }));

    await user.click(screen.getByTestId('admin-issues-row-rq-c-issue'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/requests/rq-c/issues',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        actualQty: '5',
        witnessId: 'wit-1',
        signatureDataUrl: 'data:image/png;base64,SIG',
      });
    });
  });
});
