import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyPurchasesPage from '../page';
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

// Radix Select 在 jsdom 中无法工作 (portal + pointer events) — 用 native select 替代
vi.mock('@/components/ui/select', () => {
  const React = require('react');
  const SelectCtx = React.createContext<any>(null);
  function Select({ value, onValueChange, children }: any) {
    // 收集所有 SelectItem 子节点 → 渲染成 native <select>
    const items: { value: string; label: any }[] = [];
    function collect(nodes: any) {
      React.Children.forEach(nodes, (child: any) => {
        if (!child || typeof child !== 'object') return;
        if (child.type && child.type.__isSelectItem) {
          items.push({ value: child.props.value, label: child.props.children });
        } else if (child.props && child.props.children) {
          collect(child.props.children);
        }
      });
    }
    collect(children);
    return (
      <SelectCtx.Provider value={{ value, onValueChange }}>
        <select
          data-testid="my-purchases-form-reagent"
          value={value ?? ''}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          <option value="" disabled>选择试剂</option>
          {items.map((it) => (
            <option key={it.value} value={it.value}>
              {it.label}
            </option>
          ))}
        </select>
      </SelectCtx.Provider>
    );
  }
  function SelectTrigger({ children }: any) {
    return <>{children}</>;
  }
  function SelectContent({ children }: any) {
    return <>{children}</>;
  }
  function SelectValue() {
    return null;
  }
  function SelectItem({ children }: any) {
    return <>{children}</>;
  }
  (SelectItem as any).__isSelectItem = true;
  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const reagentsFixture = [
  { id: 'reag-1', name: '乙醇' },
  { id: 'reag-2', name: '丙酮' },
];

const purchasesFixture = [
  {
    id: 'p1',
    applicantId: 'me',
    labId: 'lab-1',
    reagentId: 'reag-1',
    quantity: '500',
    unit: 'mL',
    reason: '日常实验',
    status: 'PENDING' as const,
    createdAt: '2026-05-20T00:00:00.000Z',
    reagent: { id: 'reag-1', name: '乙醇' },
  },
  {
    id: 'p2',
    applicantId: 'me',
    labId: 'lab-1',
    reagentId: 'reag-2',
    quantity: '200',
    unit: 'mL',
    reason: '色谱分析',
    status: 'APPROVED' as const,
    createdAt: '2026-05-21T00:00:00.000Z',
    reagent: { id: 'reag-2', name: '丙酮' },
  },
];

describe('/my/purchases page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'me', email: 'me@lab.local' } as any,
      hydrated: true,
    });
  });

  it('加载: GET /purchases/mine + GET /reagents 调用，行渲染', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases/mine' && (!opts || !opts.method))
        return purchasesFixture;
      if (path === '/reagents' && (!opts || !opts.method))
        return reagentsFixture;
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => {
      expect(screen.getByText('乙醇')).toBeInTheDocument();
      expect(screen.getByText('丙酮')).toBeInTheDocument();
    });
    expect(
      mockApiFetch.mock.calls.some((c) => c[0] === '/purchases/mine'),
    ).toBe(true);
    expect(mockApiFetch.mock.calls.some((c) => c[0] === '/reagents')).toBe(
      true,
    );
  });

  it('加载失败 → toast.error 被调', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases/mine') throw new Error('API 500: list down');
      if (path === '/reagents') return reagentsFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => {
      expect(
        (toast.error as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('list down'),
        ),
      ).toBe(true);
    });
  });

  it('空数据 → DataTable emptyTitle "暂无采购申请" 可见', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases/mine') return [];
      if (path === '/reagents') return reagentsFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无采购申请')).toBeInTheDocument();
    });
  });

  it('PENDING 行 actions 可见；APPROVED 行不渲染 actions 按钮', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases/mine') return purchasesFixture;
      if (path === '/reagents') return reagentsFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('my-purchases-row-p1-actions'),
      ).toBeInTheDocument();
    });
    // APPROVED 行 (p2) 不应有 actions 按钮
    expect(
      screen.queryByTestId('my-purchases-row-p2-actions'),
    ).not.toBeInTheDocument();

    // 展开 dropdown → 取消项可见
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByTestId('my-purchases-row-p1-actions'));
    await waitFor(() => {
      expect(
        screen.getByTestId('my-purchases-row-p1-cancel'),
      ).toBeInTheDocument();
    });
  });

  it('新申请: 打开 dialog → 空表单提交 → zod 校验错误 + 不发 POST', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/purchases/mine') return purchasesFixture;
      if (path === '/reagents') return reagentsFixture;
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('my-purchases-create-btn'));

    // dialog 出现
    await waitFor(() => {
      expect(
        screen.getByTestId('my-purchases-form-quantity'),
      ).toBeInTheDocument();
    });

    // 清空 unit (默认 'mL') 让所有字段均为空
    await user.clear(screen.getByTestId('my-purchases-form-unit'));
    await user.click(screen.getByTestId('my-purchases-form-submit'));

    await waitFor(() => {
      expect(screen.getByText('请选择试剂')).toBeInTheDocument();
      expect(screen.getByText('数量必填')).toBeInTheDocument();
      expect(screen.getByText('单位必填')).toBeInTheDocument();
      expect(screen.getByText('采购理由必填')).toBeInTheDocument();
    });

    const postCalls = mockApiFetch.mock.calls.filter(
      (c) => c[1]?.method === 'POST',
    );
    expect(postCalls.length).toBe(0);
  });

  it('新申请: 填齐 → POST /purchases + body 含字段 + toast.success + dialog 关 + refresh', async () => {
    const { toast } = await import('sonner');
    let listCalls = 0;
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases/mine' && (!opts || !opts.method)) {
        listCalls++;
        return purchasesFixture;
      }
      if (path === '/reagents') return reagentsFixture;
      if (opts?.method === 'POST' && path === '/purchases')
        return { id: 'p-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => screen.getByText('乙醇'));
    const initialListCalls = listCalls;

    await user.click(screen.getByTestId('my-purchases-create-btn'));
    await waitFor(() =>
      screen.getByTestId('my-purchases-form-quantity'),
    );

    // 选试剂 (native select via mock)
    const reagentSelect = screen.getByTestId(
      'my-purchases-form-reagent',
    ) as HTMLSelectElement;
    await user.selectOptions(reagentSelect, 'reag-2');

    await user.type(screen.getByTestId('my-purchases-form-quantity'), '250');
    // unit 默认为 'mL'，不动
    await user.type(
      screen.getByTestId('my-purchases-form-reason'),
      '研究用',
    );

    await user.click(screen.getByTestId('my-purchases-form-submit'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/purchases',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toMatchObject({
        reagentId: 'reag-2',
        quantity: '250',
        unit: 'mL',
        reason: '研究用',
      });
    });

    await waitFor(() => {
      expect(toast.success as any).toHaveBeenCalled();
      // dialog 关闭
      expect(
        screen.queryByTestId('my-purchases-form-quantity'),
      ).not.toBeInTheDocument();
      // refresh 触发 → /purchases/mine 又被请求
      expect(listCalls).toBeGreaterThan(initialListCalls);
    });
  });

  it('取消申请: PENDING 行 → 确认对话框 → POST /purchases/${id}/cancel + toast.success + refresh', async () => {
    const { toast } = await import('sonner');
    let listCalls = 0;
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases/mine' && (!opts || !opts.method)) {
        listCalls++;
        return purchasesFixture;
      }
      if (path === '/reagents') return reagentsFixture;
      if (opts?.method === 'POST' && path === '/purchases/p1/cancel')
        return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => screen.getByText('乙醇'));
    const initialListCalls = listCalls;

    await user.click(screen.getByTestId('my-purchases-row-p1-actions'));
    await user.click(screen.getByTestId('my-purchases-row-p1-cancel'));

    // 确认对话框出现
    await waitFor(() => {
      expect(
        screen.getByTestId('my-purchases-cancel-confirm'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('my-purchases-cancel-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/purchases/p1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(toast.success as any).toHaveBeenCalled();
      expect(listCalls).toBeGreaterThan(initialListCalls);
    });
  });

  it('POST /purchases 失败 → toast.error + dialog 不关', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/purchases/mine' && (!opts || !opts.method))
        return purchasesFixture;
      if (path === '/reagents') return reagentsFixture;
      if (opts?.method === 'POST' && path === '/purchases')
        throw new Error('API 422: 提交失败');
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<MyPurchasesPage />);

    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('my-purchases-create-btn'));
    await waitFor(() => screen.getByTestId('my-purchases-form-quantity'));

    const reagentSelect = screen.getByTestId(
      'my-purchases-form-reagent',
    ) as HTMLSelectElement;
    await user.selectOptions(reagentSelect, 'reag-1');
    await user.type(screen.getByTestId('my-purchases-form-quantity'), '100');
    await user.type(
      screen.getByTestId('my-purchases-form-reason'),
      '实验',
    );
    await user.click(screen.getByTestId('my-purchases-form-submit'));

    await waitFor(() => {
      expect(
        (toast.error as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('提交失败'),
        ),
      ).toBe(true);
      // dialog 不关
      expect(
        screen.getByTestId('my-purchases-form-quantity'),
      ).toBeInTheDocument();
    });
  });
});
