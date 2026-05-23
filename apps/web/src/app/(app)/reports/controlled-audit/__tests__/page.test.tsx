import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ControlledAuditPage from '../page';
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

// Radix Select → 共享 native select mock。RangePresetPicker 内部用了 Select。
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
    totalEvents: 128,
    distinctActors: 5,
  },
  rows: [
    {
      ts: '2026-05-20T08:30:15.123Z',
      action: 'CONSUME',
      reagentName: '硝酸银',
      actorName: '张三',
      qty: '2.5',
      beforeQty: '10.0',
      afterQty: '7.5',
    },
    {
      ts: '2026-05-19T14:22:00.000Z',
      action: 'RESTOCK',
      reagentName: '盐酸',
      actorName: '李四',
      qty: '50.0',
      beforeQty: '20.0',
      afterQty: '70.0',
    },
  ],
};

const emptyFixture = {
  summary: { totalEvents: 0, distinctActors: 0 },
  rows: [],
};

function controlledAuditCalls() {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith('/reports/controlled-audit'));
}

describe('/reports/controlled-audit page', () => {
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

  it('加载: 默认 query 含 range=90d；2 个 KPI + DataTable 行渲染', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/controlled-audit')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<ControlledAuditPage />);

    await waitFor(() => {
      const calls = controlledAuditCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toContain('range=90d');
    });

    await waitFor(() => {
      expect(
        within(
          screen.getByTestId('reports-controlled-audit-kpi-events'),
        ).getByText('128'),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByTestId('reports-controlled-audit-kpi-actors'),
        ).getByText('5'),
      ).toBeInTheDocument();
    });

    // DataTable 至少渲染 1 行；ts 派生格式 '2026-05-20 08:30:15'
    const table = screen.getByTestId('reports-controlled-audit-detail-table');
    expect(
      within(table).getByText('2026-05-20 08:30:15'),
    ).toBeInTheDocument();
    expect(within(table).getByText('硝酸银')).toBeInTheDocument();
    expect(within(table).getByText('张三')).toBeInTheDocument();
    expect(within(table).getByText('CONSUME')).toBeInTheDocument();
  });

  it('空 rows → DataTable emptyTitle "暂无审计记录"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/controlled-audit')) return emptyFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<ControlledAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无审计记录')).toBeInTheDocument();
    });
  });

  it('Range 切换到 30d → 新请求 range=30d', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/controlled-audit')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ControlledAuditPage />);

    await waitFor(() => {
      expect(controlledAuditCalls().length).toBeGreaterThan(0);
    });

    await user.selectOptions(
      screen.getByTestId('reports-controlled-audit-range-preset'),
      '30d',
    );

    await waitFor(() => {
      expect(
        controlledAuditCalls().some((p) => p.includes('range=30d')),
      ).toBe(true);
    });
  });

  it('加载失败 → 底部 <p> 显示 "加载失败:..." 文案', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/controlled-audit'))
        throw new Error('API 500: 审计挂了');
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<ControlledAuditPage />);

    await waitFor(
      () => {
        // 错误文案是 `加载失败:${error}`，整行拼接渲染
        expect(
          screen.getByText('加载失败:API 500: 审计挂了'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('ExportButton CSV → apiFetchRaw URL 带 range+format=csv', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/reports/controlled-audit')) return fullFixture;
      throw new Error(`unmocked ${path}`);
    });
    mockApiFetchRaw.mockImplementation(async () => {
      const blob = new Blob(['ts,actor\n'], { type: 'text/csv' });
      return new Response(blob, {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }) as Response;
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ControlledAuditPage />);

    await waitFor(() => {
      expect(controlledAuditCalls().length).toBeGreaterThan(0);
    });

    await user.click(screen.getByTestId('reports-controlled-audit-export'));
    await waitFor(() =>
      screen.getByTestId('reports-controlled-audit-export-csv'),
    );
    await user.click(
      screen.getByTestId('reports-controlled-audit-export-csv'),
    );

    await waitFor(() => {
      const call = mockApiFetchRaw.mock.calls.find((c) =>
        String(c[0]).includes('/reports/controlled-audit'),
      );
      expect(call).toBeDefined();
      const url = String(call![0]);
      expect(url).toContain('range=90d');
      expect(url).toContain('format=csv');
    });
  });
});
