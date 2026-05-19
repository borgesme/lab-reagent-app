import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsConfigPage from '../page';
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

const configsFixture = [
  {
    id: 'cfg-1',
    labId: 'lab-1',
    reagentId: 'r1',
    safetyStock: '20',
    expireWarningDays: 30,
  },
];
const reagentsFixture = [
  { id: 'r1', name: '乙醇', hazardLevel: 'NORMAL' },
  { id: 'r2', name: '甲苯', hazardLevel: 'CONTROLLED', controlType: '易制毒' },
];
const labsFixture = [
  { id: 'lab-1', name: 'Lab A' },
  { id: 'lab-2', name: 'Lab B' },
];

function setupHappy() {
  mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
    if (path === '/lab-reagent-configs' && !opts?.method) return configsFixture;
    if (path === '/reagents' && !opts?.method) return reagentsFixture;
    if (path === '/labs' && !opts?.method) return labsFixture;
    if (opts?.method === 'POST' && path === '/lab-reagent-configs')
      return { id: 'cfg-2' };
    if (opts?.method === 'PATCH' && path.startsWith('/lab-reagent-configs/'))
      return { ok: true };
    if (opts?.method === 'DELETE' && path.startsWith('/lab-reagent-configs/'))
      return { ok: true };
    throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
  });
}

describe('/admin/alerts/config page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    setupHappy();
  });

  it('渲染配置列表 + 把 labId/reagentId 解析为名称', async () => {
    render(<AlertsConfigPage />);
    await waitFor(() => screen.getByText('Lab A'));
    expect(screen.getByText('乙醇')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('新增配置 → POST + body.expireWarningDays 转 Number + dialog 关闭', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AlertsConfigPage />);
    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByRole('button', { name: /新增/ }));

    const triggers = await screen.findAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: 'Lab B' }));
    await user.click(triggers[1]);
    await user.click(await screen.findByRole('option', { name: '甲苯' }));

    await user.type(screen.getByLabelText('安全阈值'), '15');
    const daysInput = screen.getByLabelText('预警天数');
    await user.clear(daysInput);
    await user.type(daysInput, '45');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/lab-reagent-configs',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        labId: 'lab-2',
        reagentId: 'r2',
        safetyStock: '15',
        expireWarningDays: 45,
      });
      expect(typeof post![1].body.expireWarningDays).toBe('number');
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('安全阈值')).not.toBeInTheDocument();
    });
  });

  it('POST 失败 → toast.error + dialog 保持打开', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/lab-reagent-configs' && !opts?.method) return configsFixture;
      if (path === '/reagents' && !opts?.method) return reagentsFixture;
      if (path === '/labs' && !opts?.method) return labsFixture;
      if (opts?.method === 'POST' && path === '/lab-reagent-configs')
        throw new Error('API 422: 阈值非法');
      throw new Error('unmocked');
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AlertsConfigPage />);
    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByRole('button', { name: /新增/ }));

    const triggers = await screen.findAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: 'Lab B' }));
    await user.click(triggers[1]);
    await user.click(await screen.findByRole('option', { name: '乙醇' }));

    await user.type(screen.getByLabelText('安全阈值'), '10');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(screen.getByLabelText('安全阈值')).toBeInTheDocument();
    });
  });

  it('删除 → DELETE /lab-reagent-configs/{id} + toast', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AlertsConfigPage />);
    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByRole('button', { name: '操作' }));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));

    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/lab-reagent-configs/cfg-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(toast.success as any).toHaveBeenCalledWith('已删除');
    });
  });

  it('编辑 → 预填 + lab/reagent disabled + PATCH 仅 safetyStock/expireWarningDays', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AlertsConfigPage />);
    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByRole('button', { name: '操作' }));
    await user.click(screen.getByRole('menuitem', { name: '编辑' }));

    const stock = await screen.findByLabelText('安全阈值');
    const days = screen.getByLabelText('预警天数');
    expect(stock).toHaveValue('20');
    expect(days).toHaveValue('30');

    const triggers = screen.getAllByRole('combobox');
    expect(triggers[0]).toBeDisabled();
    expect(triggers[1]).toBeDisabled();

    await user.clear(stock);
    await user.type(stock, '50');
    await user.clear(days);
    await user.type(days, '60');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const patch = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH' && c[0] === '/lab-reagent-configs/cfg-1',
      );
      expect(patch).toBeDefined();
      expect(patch![1].body).toEqual({
        safetyStock: '50',
        expireWarningDays: 60,
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('安全阈值')).not.toBeInTheDocument();
    });
  });
});
