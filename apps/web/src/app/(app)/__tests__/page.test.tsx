import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../page';
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

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Dashboard 页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'u1', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('从 /dashboard/kpi 拉一个聚合接口并把四个值上屏', async () => {
    mockApiFetch.mockResolvedValueOnce({
      pendingApprovals: 3,
      myRequests: 5,
      stockAlerts: 2,
      controlledReagents: 7,
    });
    renderWithQuery(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-kpi-待我审批')).toHaveTextContent('3');
      expect(screen.getByTestId('dashboard-kpi-我的申请')).toHaveTextContent('5');
      expect(screen.getByTestId('dashboard-kpi-库存预警')).toHaveTextContent('2');
      expect(screen.getByTestId('dashboard-kpi-管控试剂')).toHaveTextContent('7');
    });

    const kpiCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith('/dashboard/kpi'),
    );
    expect(kpiCalls.length).toBe(1);
  });

  it('接口报错 → toast.error 且四个值兜底为 0', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    renderWithQuery(<DashboardPage />);

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
    });
    expect(screen.getByTestId('dashboard-kpi-待我审批')).toHaveTextContent('0');
  });
});
