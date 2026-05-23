import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryTurnoverPage from '../page';
import { useAuth } from '@/lib/auth-store';
import { installBlobDownloadStub } from '@/test-utils/mock-blob-download';

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
    avgTurnoverDays: 42,
    lowStockCount: 7,
  },
  rows: [
    {
      reagentId: 'r1',
      name: '试剂甲',
      currentQty: '5.0',
      avgQty: '20.0',
      dailyOut: '0.5',
      turnoverDays: 10,
      status: 'low' as const,
    },
    {
      reagentId: 'r2',
      name: '试剂乙',
      currentQty: '30.0',
      avgQty: '50.0',
      dailyOut: '1.5',
      turnoverDays: 20,
      status: 'stale' as const,
    },
    {
      reagentId: 'r3',
      name: '试剂丙',
      currentQty: '100.0',
      avgQty: '80.0',
      dailyOut: '4.0',
      turnoverDays: 25,
      status: 'ok' as const,
    },
  ],
};

// 12 行 fixture (含 2 个 stale)，用来验证 top10 filter+slice 逻辑
const top10Fixture = {
  summary: { avgTurnoverDays: 30, lowStockCount: 2 },
  rows: [
    ...Array.from({ length: 10 }, (_, i) => ({
      reagentId: `n${i}`,
      name: `normal-${i}`,
      currentQty: '10',
      avgQty: '10',
      dailyOut: '1',
      turnoverDays: i + 5, // 5..14 升序
      status: 'ok' as const,
    })),
    {
      reagentId: 's1',
      name: 'stale-A',
      currentQty: '10',
      avgQty: '10',
      dailyOut: '0',
      turnoverDays: 1,
      status: 'stale' as const,
    },
    {
      reagentId: 's2',
      name: 'stale-B',
      currentQty: '10',
      avgQty: '10',
      dailyOut: '0',
      turnoverDays: 2,
      status: 'stale' as const,
    },
  ],
};

const allStaleFixture = {
  summary: { avgTurnoverDays: 0, lowStockCount: 0 },
  rows: [
    {
      reagentId: 's1',
      name: 'stale-A',
      currentQty: '0',
      avgQty: '0',
      dailyOut: '0',
      turnoverDays: 1,
      status: 'stale' as const,
    },
  ],
};

const emptyFixture = {
  summary: { avgTurnoverDays: 0, lowStockCount: 0 },
  rows: [],
};

function turnoverCalls() {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith('/reports/inventory-turnover'));
}

describe('/reports/inventory-turnover page', () => {
  let restoreBlob: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    restoreBlob = installBlobDownloadStub();
  });
  afterEach(() => {
    restoreBlob();
  });

  it('加载: 默认 query 含 range=30d；2 个 KPI + DataTable 行渲染', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(() => {
      const calls = turnoverCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toContain('range=30d');
    });

    await waitFor(() => {
      expect(
        within(
          screen.getByTestId('reports-inventory-turnover-kpi-avg-turnover'),
        ).getByText('42'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-inventory-turnover-kpi-low-stock'),
        ).getByText('7'),
      ).toBeInTheDocument();
    });

    const table = screen.getByTestId('reports-inventory-turnover-detail-table');
    expect(within(table).getByText('试剂甲')).toBeInTheDocument();
    expect(within(table).getByText('试剂乙')).toBeInTheDocument();
    expect(within(table).getByText('试剂丙')).toBeInTheDocument();
  });

  it('空 rows → ChartCard "暂无数据" + DataTable "暂无明细"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover')) return emptyFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
      expect(screen.getByText('暂无明细')).toBeInTheDocument();
    });
  });

  it('派生 top10: 全 stale → ChartCard empty；含非 stale → ChartCard 非 empty', async () => {
    // 先验证：全 stale 时 ChartCard 显示 empty 文案
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover'))
        return allStaleFixture;
      throw new Error(`unmocked ${path}`);
    });

    const { unmount } = renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(() => {
      const chart = screen.getByTestId('reports-inventory-turnover-chart');
      expect(within(chart).getByText('暂无数据')).toBeInTheDocument();
    });

    unmount();
    vi.clearAllMocks();

    // 再验证：有非 stale 行时 ChartCard 不再 empty (无 "暂无数据" 文案)
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover')) return top10Fixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<InventoryTurnoverPage />);
    await waitFor(() => {
      expect(turnoverCalls().length).toBeGreaterThan(0);
    });

    // ChartCard 在 jsdom 中 Recharts dynamic 不渲染，但 empty=false 时 children 槽位仍可见 -- 关键是不应再出现 "暂无数据"
    const chart = screen.getByTestId('reports-inventory-turnover-chart');
    expect(within(chart).queryByText('暂无数据')).not.toBeInTheDocument();
  });

  it('Status badge: low/stale/ok → "低"/"滞销"/"正常"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(() => {
      expect(turnoverCalls().length).toBeGreaterThan(0);
    });

    const table = screen.getByTestId('reports-inventory-turnover-detail-table');
    await waitFor(() => {
      expect(within(table).getByText('低')).toBeInTheDocument();
      expect(within(table).getByText('滞销')).toBeInTheDocument();
      expect(within(table).getByText('正常')).toBeInTheDocument();
    });
  });

  it('加载失败 → ChartCard 显示错误文案', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover'))
        throw new Error('API 500: 库存挂了');
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(
      () => {
        expect(screen.getByText('API 500: 库存挂了')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('ExportButton Excel → apiFetchRaw URL 带 range+format=xlsx', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/inventory-turnover')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });
    mockApiFetchRaw.mockImplementation(async () => {
      const blob = new Blob(['xx'], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return new Response(blob, { status: 200 }) as Response;
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<InventoryTurnoverPage />);

    await waitFor(() => {
      expect(turnoverCalls().length).toBeGreaterThan(0);
    });

    await user.click(screen.getByTestId('reports-inventory-turnover-export'));
    await waitFor(() =>
      screen.getByTestId('reports-inventory-turnover-export-xlsx'),
    );
    await user.click(
      screen.getByTestId('reports-inventory-turnover-export-xlsx'),
    );

    await waitFor(() => {
      const call = mockApiFetchRaw.mock.calls.find((c) =>
        String(c[0]).includes('/reports/inventory-turnover'),
      );
      expect(call).toBeDefined();
      const url = String(call![0]);
      expect(url).toContain('range=30d');
      expect(url).toContain('format=xlsx');
    });
  });
});
