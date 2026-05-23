import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PurchaseAmountPage from '../page';
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
    totalAmount: '12345.67',
    batchCount: 42,
    pendingBatchCount: 3,
  },
  series: [
    { bucket: '2026-01', amount: '5000.00', batchCount: 10 },
    { bucket: '2026-02', amount: '7345.67', batchCount: 32 },
  ],
};

const emptyFixture = {
  summary: { totalAmount: '0', batchCount: 0, pendingBatchCount: 0 },
  series: [],
};

function purchaseAmountCalls() {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith('/reports/purchase-amount'));
}

describe('/reports/purchase-amount page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('加载: 默认 query 含 range=365d & groupBy=month；3 个 KpiCard 渲染', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(() => {
      const calls = purchaseAmountCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toContain('range=365d');
      expect(calls[0]).toContain('groupBy=month');
    });

    await waitFor(() => {
      expect(
        within(
          screen.getByTestId('reports-purchase-amount-kpi-total'),
        ).getByText('12345.67'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-purchase-amount-kpi-batch-count'),
        ).getByText('42'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-purchase-amount-kpi-pending-batch'),
        ).getByText('3'),
      ).toBeInTheDocument();
    });
  });

  it('空 series → ChartCard 显示"暂无数据"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount')) return emptyFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  it('GroupBy 切换"按品类" → 新请求 groupBy=category；ChartCard 标题更新', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(() => {
      expect(purchaseAmountCalls().length).toBeGreaterThan(0);
    });
    // 初始标题为"按月"
    expect(screen.getByText('采购金额(按月)')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByTestId('reports-purchase-amount-groupby'),
      'category',
    );

    await waitFor(() => {
      expect(
        purchaseAmountCalls().some((p) => p.includes('groupBy=category')),
      ).toBe(true);
    });
    expect(screen.getByText('采购金额(按品类)')).toBeInTheDocument();
  });

  it('Range 切换到 30d → 新请求 range=30d', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(() => {
      expect(purchaseAmountCalls().length).toBeGreaterThan(0);
    });

    // RangePresetPicker 内置的 Select 有 testid '<rangeTestId>-preset'
    await user.selectOptions(
      screen.getByTestId('reports-purchase-amount-range-preset'),
      '30d',
    );

    await waitFor(() => {
      expect(
        purchaseAmountCalls().some((p) => p.includes('range=30d')),
      ).toBe(true);
    });
  });

  it('加载失败 → ChartCard 显示错误文案', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount'))
        throw new Error('API 500: 服务繁忙');
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(
      () => {
        expect(screen.getByText('API 500: 服务繁忙')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('ExportButton CSV → apiFetchRaw 用 endpoint 带 range+groupBy+format=csv', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/purchase-amount')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });
    // apiFetchRaw 返回一个 ok blob
    mockApiFetchRaw.mockImplementation(async () => {
      const blob = new Blob(['col1,col2\n1,2\n'], { type: 'text/csv' });
      return new Response(blob, {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }) as Response;
    });
    // 兜底 URL.createObjectURL
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
    renderWithQuery(<PurchaseAmountPage />);

    await waitFor(() => {
      expect(purchaseAmountCalls().length).toBeGreaterThan(0);
    });

    await user.click(screen.getByTestId('reports-purchase-amount-export'));
    await waitFor(() =>
      screen.getByTestId('reports-purchase-amount-export-csv'),
    );
    await user.click(
      screen.getByTestId('reports-purchase-amount-export-csv'),
    );

    await waitFor(() => {
      const call = mockApiFetchRaw.mock.calls.find((c) =>
        String(c[0]).includes('/reports/purchase-amount'),
      );
      expect(call).toBeDefined();
      const url = String(call![0]);
      expect(url).toContain('range=365d');
      expect(url).toContain('groupBy=month');
      expect(url).toContain('format=csv');
    });
  });
});
