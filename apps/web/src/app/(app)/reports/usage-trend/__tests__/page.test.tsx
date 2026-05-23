import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsageTrendPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockApiFetch = vi.fn();
const mockApiFetchRaw = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: (...args: any[]) => mockApiFetchRaw(...args),
  apiBaseUrl: '/api/v1',
}));

// Radix Select → 共享 native select mock。trigger 自带 data-testid，自动透传。
vi.mock('@/components/ui/select', async () => {
  const { createSelectMock } = await import('@/test-utils/mock-select');
  return createSelectMock();
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fullFixture = {
  summary: {
    totalIssued: '888.5',
    distinctReagents: 17,
    avgDailyIssued: '29.6',
  },
  series: [
    { bucket: '2026-05-01', qty: '40.0' },
    { bucket: '2026-05-02', qty: '52.5' },
  ],
};

const emptyFixture = {
  summary: { totalIssued: '0', distinctReagents: 0, avgDailyIssued: '0' },
  series: [],
};

function usageTrendCalls() {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith('/reports/usage-trend'));
}

describe('/reports/usage-trend page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('加载: 默认 query 含 range=30d & groupBy=day；3 个 KpiCard 渲染', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<UsageTrendPage />);

    await waitFor(() => {
      const calls = usageTrendCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toContain('range=30d');
      expect(calls[0]).toContain('groupBy=day');
    });

    await waitFor(() => {
      expect(
        within(
          screen.getByTestId('reports-usage-trend-kpi-total'),
        ).getByText('888.5'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-usage-trend-kpi-distinct'),
        ).getByText('17'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-usage-trend-kpi-daily-avg'),
        ).getByText('29.6'),
      ).toBeInTheDocument();
    });
  });

  it('空 series → ChartCard 显示"暂无数据"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend')) return emptyFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<UsageTrendPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  it('GroupBy 切换"按周" → 新请求 groupBy=week', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsageTrendPage />);

    await waitFor(() => {
      expect(usageTrendCalls().length).toBeGreaterThan(0);
    });

    await user.selectOptions(
      screen.getByTestId('reports-usage-trend-groupby'),
      'week',
    );

    await waitFor(() => {
      expect(
        usageTrendCalls().some((p) => p.includes('groupBy=week')),
      ).toBe(true);
    });
  });

  it('Range 切换到 90d → 新请求 range=90d', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsageTrendPage />);

    await waitFor(() => {
      expect(usageTrendCalls().length).toBeGreaterThan(0);
    });

    await user.selectOptions(
      screen.getByTestId('reports-usage-trend-range-preset'),
      '90d',
    );

    await waitFor(() => {
      expect(
        usageTrendCalls().some((p) => p.includes('range=90d')),
      ).toBe(true);
    });
  });

  it('加载失败 → ChartCard 显示错误文案', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend'))
        throw new Error('API 500: 趋势挂了');
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<UsageTrendPage />);

    await waitFor(
      () => {
        expect(screen.getByText('API 500: 趋势挂了')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('ExportButton Excel → apiFetchRaw 用 endpoint 带 range+groupBy+format=xlsx', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/usage-trend')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });
    mockApiFetchRaw.mockImplementation(async () => {
      const blob = new Blob(['xx'], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return new Response(blob, { status: 200 }) as Response;
    });
    if (typeof URL.createObjectURL !== 'function') {
      (URL as any).createObjectURL = vi.fn(() => 'blob:x');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as any).revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsageTrendPage />);

    await waitFor(() => {
      expect(usageTrendCalls().length).toBeGreaterThan(0);
    });

    await user.click(screen.getByTestId('reports-usage-trend-export'));
    await waitFor(() =>
      screen.getByTestId('reports-usage-trend-export-xlsx'),
    );
    await user.click(screen.getByTestId('reports-usage-trend-export-xlsx'));

    await waitFor(() => {
      const call = mockApiFetchRaw.mock.calls.find((c) =>
        String(c[0]).includes('/reports/usage-trend'),
      );
      expect(call).toBeDefined();
      const url = String(call![0]);
      expect(url).toContain('range=30d');
      expect(url).toContain('groupBy=day');
      expect(url).toContain('format=xlsx');
    });
  });
});
