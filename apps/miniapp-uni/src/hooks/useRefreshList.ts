import { ref, type Ref } from 'vue';

export type RefreshState = 'none' | 'refreshing';
export type LoadState = 'none' | 'loading' | 'empty' | 'ended';

export interface UseRefreshListOpts<T, Q extends Record<string, any> = any> {
  pageSize?: number;
  getSearchParams?: () => Q;
  extract?: (resp: any) => { records: T[]; total: number };
}

export interface UseRefreshListReturn<T> {
  refreshing: Ref<RefreshState>;
  loading: Ref<LoadState>;
  pageNum: Ref<number>;
  totalRows: Ref<number>;
  dataList: Ref<T[]>;
  loadingFlag: Ref<boolean>;
  fetchListData: () => Promise<void>;
  fetchListRefresh: () => Promise<void>;
  fetchListLoad: () => Promise<void>;
  resetListData: () => void;
}

export function useRefreshList<T = any, Q extends Record<string, any> = any>(
  requestAPI: (params: Q & { pageNum: number; pageSize: number }) => Promise<any>,
  opts: UseRefreshListOpts<T, Q> = {},
): UseRefreshListReturn<T> {
  const { pageSize = 20, getSearchParams = () => ({} as Q) } = opts;
  const extract =
    opts.extract ??
    ((r: any) => ({
      records: (r?.items ?? r?.records ?? r ?? []) as T[],
      total: Number(r?.total ?? r?.items?.length ?? r?.length ?? 0),
    }));

  const refreshing = ref<RefreshState>('none');
  const loading = ref<LoadState>('none');
  const pageNum = ref(1);
  const totalRows = ref(0);
  const dataList = ref<T[]>([]) as Ref<T[]>;
  const loadingFlag = ref(false);
  const firstFlag = ref(true);

  async function fetchListData() {
    if (firstFlag.value) loadingFlag.value = true;
    try {
      const params = {
        ...getSearchParams(),
        pageNum: pageNum.value,
        pageSize,
      } as Q & { pageNum: number; pageSize: number };
      const resp = await requestAPI(params);
      const { records, total } = extract(resp);

      if (pageNum.value === 1) dataList.value = [...records];
      else dataList.value = [...dataList.value, ...records];
      totalRows.value = total;

      if (totalRows.value === 0) loading.value = 'empty';
      else if (pageNum.value * pageSize >= totalRows.value) loading.value = 'ended';
      else loading.value = 'none';

      if (refreshing.value === 'refreshing') refreshing.value = 'none';
    } finally {
      loadingFlag.value = false;
      firstFlag.value = false;
      if (refreshing.value === 'refreshing') refreshing.value = 'none';
    }
  }

  async function fetchListRefresh() {
    if (refreshing.value === 'refreshing') return;
    pageNum.value = 1;
    totalRows.value = 0;
    refreshing.value = 'refreshing';
    try {
      await fetchListData();
    } finally {
      try {
        uni.stopPullDownRefresh();
      } catch {
        /* H5 无此 API */
      }
    }
  }

  async function fetchListLoad() {
    if (loading.value === 'ended' || loading.value === 'empty' || loading.value === 'loading')
      return;
    pageNum.value += 1;
    loading.value = 'loading';
    await fetchListData();
  }

  function resetListData() {
    pageNum.value = 1;
    totalRows.value = 0;
    dataList.value = [];
    firstFlag.value = true;
    refreshing.value = 'none';
    loading.value = 'none';
  }

  return {
    refreshing,
    loading,
    pageNum,
    totalRows,
    dataList,
    loadingFlag,
    fetchListData,
    fetchListRefresh,
    fetchListLoad,
    resetListData,
  };
}
