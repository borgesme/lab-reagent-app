import { describe, it, expect, vi } from 'vitest';
import { useRefreshList } from '@/hooks/useRefreshList';

describe('useRefreshList', () => {
  it('refresh 拉第一页，数据 + total + loading=none', async () => {
    const api = vi.fn().mockResolvedValue({ items: [{ id: 1 }, { id: 2 }], total: 30 });
    const list = useRefreshList<any>(api, { pageSize: 10 });
    await list.fetchListRefresh();
    expect(api).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 });
    expect(list.dataList.value).toEqual([{ id: 1 }, { id: 2 }]);
    expect(list.totalRows.value).toBe(30);
    expect(list.loading.value).toBe('none');
    expect(list.refreshing.value).toBe('none');
  });

  it('loadMore 追加并切到 ended', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 1 }, { id: 2 }], total: 4 })
      .mockResolvedValueOnce({ items: [{ id: 3 }, { id: 4 }], total: 4 });
    const list = useRefreshList<any>(api, { pageSize: 2 });
    await list.fetchListRefresh();
    expect(list.loading.value).toBe('none');
    await list.fetchListLoad();
    expect(list.dataList.value.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(list.loading.value).toBe('ended');
  });

  it('空结果 → loading=empty', async () => {
    const api = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const list = useRefreshList<any>(api);
    await list.fetchListRefresh();
    expect(list.loading.value).toBe('empty');
    expect(list.dataList.value).toEqual([]);
  });

  it('resetListData 复位所有状态', async () => {
    const api = vi.fn().mockResolvedValue({ items: [{ id: 1 }], total: 1 });
    const list = useRefreshList<any>(api);
    await list.fetchListRefresh();
    list.resetListData();
    expect(list.dataList.value).toEqual([]);
    expect(list.totalRows.value).toBe(0);
    expect(list.pageNum.value).toBe(1);
  });
});
