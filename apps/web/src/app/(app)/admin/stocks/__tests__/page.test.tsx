import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StocksPage from '../page';
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
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const stocksFixture = [
  {
    id: 's1',
    batchNo: 'B-001',
    currentQty: '100',
    unit: 'g',
    location: '柜A-1',
    expireDate: '2027-12-31',
    reagent: { id: 'r1', name: '乙醇' },
    lab: { id: 'lab-1', name: 'Lab A' },
  },
];
const reagentsFixture = [{ id: 'r1', name: '乙醇' }];
const labsFixture = [{ id: 'lab-1', name: 'Lab A' }];

function setupHappy() {
  mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
    if (path === '/stocks' && (!opts || !opts.method)) return stocksFixture;
    if (path === '/reagents' && (!opts || !opts.method)) return reagentsFixture;
    if (path === '/labs' && (!opts || !opts.method)) return labsFixture;
    if (opts?.method === 'POST' && path === '/stocks') return { id: 's2' };
    throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
  });
}

describe('/admin/stocks page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    setupHappy();
  });

  it('渲染库存列表', async () => {
    renderWithQuery(<StocksPage />);
    await waitFor(() => screen.getByText('乙醇'));
    expect(screen.getByText('B-001')).toBeInTheDocument();
    expect(screen.getByText('100 g')).toBeInTheDocument();
  });

  it('入库 → POST /stocks + body 字段映射正确 + dialog 关闭', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<StocksPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByRole('button', { name: /入库/ }));

    const triggers = await screen.findAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: '乙醇' }));
    await user.click(triggers[1]);
    await user.click(await screen.findByRole('option', { name: 'Lab A' }));

    await user.type(screen.getByLabelText('批号'), 'B-NEW');
    await user.type(screen.getByLabelText('数量'), '50');
    await user.type(screen.getByLabelText('存放位置'), '柜B-2');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/stocks',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toMatchObject({
        reagentId: 'r1',
        labId: 'lab-1',
        batchNo: 'B-NEW',
        initialQty: '50',
        currentQty: '50',
        unit: 'g',
        location: '柜B-2',
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('数量')).not.toBeInTheDocument();
    });
  });

  it('入库失败 → toast.error + dialog 保持打开', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/stocks' && !opts?.method) return stocksFixture;
      if (path === '/reagents' && !opts?.method) return reagentsFixture;
      if (path === '/labs' && !opts?.method) return labsFixture;
      if (opts?.method === 'POST' && path === '/stocks')
        throw new Error('API 422: 批号已存在');
      throw new Error('unmocked');
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<StocksPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByRole('button', { name: /入库/ }));

    const triggers = await screen.findAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: '乙醇' }));
    await user.click(triggers[1]);
    await user.click(await screen.findByRole('option', { name: 'Lab A' }));
    await user.type(screen.getByLabelText('数量'), '50');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(screen.getByLabelText('数量')).toBeInTheDocument();
    });
  });
});
