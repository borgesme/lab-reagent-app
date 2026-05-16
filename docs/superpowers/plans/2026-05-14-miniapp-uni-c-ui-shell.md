# Plan C — miniapp-uni UI 骨架：hooks + 自定义导航

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 plan B 基建之上搭起 UI 骨架——自定义 NavBar（避让微信胶囊）+ 自定义 TabBar（5 项）+ CustomBottomArea（安全区）+ 三个 hooks（useWxCapsuleRect / useLoginCheck / useRefreshList）；把 plan A/B 占位页改造成"带 NavBar 的 5 tab 壳"，business 内容仍是占位，留 plan D 填。

**Architecture:**
- NavBar：左/中/右 slot，固定定位，微信端调 `uni.getMenuButtonBoundingClientRect` 避让胶囊；H5 / 其他端 fallback 到 `statusBarHeight + 44px`
- TabBar：固定底栏 5 项；点击 `uni.switchTab` + 本地 `active` ref 同步；通过 prop `current` 由各页传入
- 反馈封装（spec §4.4）：本 plan **不创建新组件**——Toast/Loading 直接 `uni.show*`，Modal 用 `u-modal`；只在文档约定，业务页用到时直接调
- Login 页：把 plan B 临时塞在 home 页的 login form 挪到 `pages/login`，让 home 变成"工作台壳子"；plan D 再正式重写

**Tech Stack:** 沿用 plan A/B。新引入：无新依赖（uview-plus / pinia / vue-i18n 都已有）。

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md) §4.2 / §4.3 / §4.4 / §4.5 + §6.1（tab IA）。

**前置:** Plan A + Plan B 已完成。`useAuth` / `i18n` / `apiRequest` / `api/modules/*` 都已就绪。

**参考实现：**
- `apps/Art-app/src/components/tab-bar/tab-bar.vue` — 自定义 tab-bar 结构 + 胶囊形外观（plan C 改 emerald + 5 项 + 移除登录拦截到 hook）
- `apps/Art-app/src/components/custom-bottom-area/custom-bottom-area.vue` — 安全区占位
- `apps/Art-app/src/hooks/useWxCapsuleRect.js` — 微信胶囊 API 封装（plan C 转 TS + 加测试）
- `apps/Art-app/src/hooks/useLoginCheck.js` — `checkLogin(callback, url?)` 约定（plan C 改用 plan B 的 `useAuth`）
- `apps/Art-app/src/hooks/useRefreshList.js` — 状态机 `none/refreshing/empty/ended/loading`（plan C 转 TS + 加测试）

---

## File Structure

**本 plan 新增/修改文件（全部在 `apps/miniapp-uni/` 下）：**

```
apps/miniapp-uni/
├── src/
│   ├── hooks/                        【新增 3 + 已有 useBootTokenRefresh】
│   │   ├── useBootTokenRefresh.ts    # plan B 已有
│   │   ├── useWxCapsuleRect.ts       # 新
│   │   ├── useLoginCheck.ts          # 新
│   │   └── useRefreshList.ts         # 新
│   ├── components/                   【新增】
│   │   ├── nav-bar/
│   │   │   └── nav-bar.vue           # 自定义导航栏（slot left/center/right）
│   │   ├── tab-bar/
│   │   │   └── tab-bar.vue           # 5 tab 底栏
│   │   └── custom-bottom-area/
│   │       └── custom-bottom-area.vue # 安全区占位
│   ├── pages.json                    【改】8 页注册;不写 tabBar 段
│   └── pages/                        【改 + 新增 3】
│       ├── home/index.vue            # 改:删 login form,改为"工作台壳"
│       ├── login/index.vue           # 改:接收 plan B 挪过来的 login form
│       ├── mine/index.vue            # 改:加 NavBar + TabBar 框
│       ├── my-requests/index.vue     # 新占位
│       ├── approvals/index.vue       # 新占位
│       └── notifications/index.vue   # 新占位
└── src/__tests__/                    【新增】
    ├── hooks-wx-capsule.test.ts      # 2 用例
    ├── hooks-login-check.test.ts     # 1 用例
    └── hooks-refresh-list.test.ts    # 3 用例(refresh/loadMore/empty/ended)
```

**不动文件：** plan A spike.test.ts / plan B locale stores api 全套 / vitest.setup.ts。

---

## Task C1: useWxCapsuleRect hook（TS port）

**Files:**
- Create: `apps/miniapp-uni/src/hooks/useWxCapsuleRect.ts`
- Create: `apps/miniapp-uni/src/__tests__/hooks-wx-capsule.test.ts`

- [ ] **Step C1.1: 写 `src/hooks/useWxCapsuleRect.ts`**

```ts
import { computed, ref } from 'vue';

interface CapsuleRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 微信小程序胶囊避让 hook。
 *
 * - 微信端:调 `uni.getMenuButtonBoundingClientRect` 拿到胶囊矩形 → 提供
 *   `avoidCapsuleStyle`(顶部+右侧 padding) 与 `alignRightElementStyle`(右上角对齐)
 * - 其他端(H5 / 支付宝 / 头条 ...):rect=null,navBarHeight 走 `statusBarHeight + 44`
 *   兜底,样式返回 {}
 *
 * 用法:
 *   const { avoidCapsuleStyle, navBarHeight, update } = useWxCapsuleRect();
 *   onShow(() => update());
 *   <view :style="avoidCapsuleStyle">...</view>
 */
export function useWxCapsuleRect() {
  const rect = ref<CapsuleRect | null>(null);
  const statusBarHeight = ref(0);
  const screenWidth = ref(0);

  function update() {
    try {
      const si = uni.getSystemInfoSync();
      statusBarHeight.value = si.statusBarHeight ?? 0;
      screenWidth.value = (si.screenWidth ?? si.windowWidth) ?? 0;
    } catch {
      /* H5 mock,留默认 0 */
    }
    let r: CapsuleRect | null = null;
    try {
      if (typeof (uni as any).getMenuButtonBoundingClientRect === 'function') {
        r = (uni as any).getMenuButtonBoundingClientRect();
      } else if (typeof (globalThis as any).wx?.getMenuButtonBoundingClientRect === 'function') {
        r = (globalThis as any).wx.getMenuButtonBoundingClientRect();
      }
    } catch {
      r = null;
    }
    rect.value = r;
  }

  update();

  const navBarHeight = computed(() => {
    if (!rect.value) return 44 + statusBarHeight.value;
    return rect.value.height + (rect.value.top - statusBarHeight.value) * 2;
  });

  const capsuleLeft = computed(() => rect.value?.left ?? 0);
  const capsuleRightSpace = computed(() =>
    rect.value && screenWidth.value ? screenWidth.value - rect.value.left : 0,
  );

  const avoidCapsuleStyle = computed(() => {
    if (!rect.value) return {} as Record<string, string>;
    return {
      paddingTop: `${rect.value.top}px`,
      paddingRight: `${capsuleRightSpace.value}px`,
    };
  });

  const alignRightElementStyle = computed(() => {
    if (!rect.value) return {} as Record<string, string>;
    return {
      position: 'absolute',
      top: `${rect.value.top}px`,
      right: `${capsuleRightSpace.value}px`,
      height: `${rect.value.height}px`,
    };
  });

  return {
    rect,
    statusBarHeight,
    screenWidth,
    navBarHeight,
    capsuleLeft,
    capsuleRightSpace,
    avoidCapsuleStyle,
    alignRightElementStyle,
    update,
  };
}
```

- [ ] **Step C1.2: 写 `src/__tests__/hooks-wx-capsule.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWxCapsuleRect } from '@/hooks/useWxCapsuleRect';

beforeEach(() => {
  delete (uni as any).getMenuButtonBoundingClientRect;
  delete (globalThis as any).wx;
});

describe('useWxCapsuleRect', () => {
  it('无胶囊 API(H5) → rect=null,navBarHeight 走 statusBar+44 兜底', () => {
    const { rect, navBarHeight, avoidCapsuleStyle } = useWxCapsuleRect();
    expect(rect.value).toBeNull();
    // vitest.setup mock statusBarHeight=20
    expect(navBarHeight.value).toBe(64);
    expect(avoidCapsuleStyle.value).toEqual({});
  });

  it('微信端 → 拿到 rect,生成 padding 与对齐样式', () => {
    (uni as any).getMenuButtonBoundingClientRect = () => ({
      top: 24,
      right: 87,
      bottom: 56,
      left: 280,
      width: 87,
      height: 32,
    });
    // 让 systemInfo.screenWidth = 375
    const origin = uni.getSystemInfoSync as any;
    (uni.getSystemInfoSync as any) = () => ({
      statusBarHeight: 20,
      screenWidth: 375,
      windowWidth: 375,
      language: 'zh-CN',
      platform: 'devtools',
      safeAreaInsets: { top: 20, bottom: 0, left: 0, right: 0 },
    });
    try {
      const { rect, capsuleRightSpace, avoidCapsuleStyle, alignRightElementStyle } =
        useWxCapsuleRect();
      expect(rect.value?.top).toBe(24);
      expect(capsuleRightSpace.value).toBe(95); // 375 - 280
      expect(avoidCapsuleStyle.value.paddingTop).toBe('24px');
      expect(alignRightElementStyle.value.position).toBe('absolute');
    } finally {
      (uni.getSystemInfoSync as any) = origin;
    }
  });
});
```

- [ ] **Step C1.3: commit**

```bash
git add apps/miniapp-uni/src/hooks/useWxCapsuleRect.ts apps/miniapp-uni/src/__tests__/hooks-wx-capsule.test.ts
git commit -m "feat(miniapp-uni): useWxCapsuleRect hook + 2 用例"
```

---

## Task C2: useLoginCheck hook

**Files:**
- Create: `apps/miniapp-uni/src/hooks/useLoginCheck.ts`
- Create: `apps/miniapp-uni/src/__tests__/hooks-login-check.test.ts`

- [ ] **Step C2.1: 写 `src/hooks/useLoginCheck.ts`**

参考 Art-app `useLoginCheck.js` + 对接 plan B 的 `useAuth`：

```ts
import { useAuth } from '@/stores/auth';

/**
 * 登录态校验。
 *
 * - `checkLogin(callback, url?)`:未登录 → navigateTo url(默认 /pages/login/index)
 * - 已登录 → 执行 callback
 *
 * 与 spec §5.4 一致:tab-bar 上需登录的入口/敏感操作前用此 hook 拦截。
 */
export function useLoginCheck() {
  const auth = useAuth();

  function checkLogin(
    callback: () => void | Promise<void>,
    url = '/pages/login/index',
  ) {
    if (!auth.tokens?.accessToken) {
      uni.navigateTo({ url });
      return;
    }
    callback();
  }

  return { checkLogin };
}
```

- [ ] **Step C2.2: 写 `src/__tests__/hooks-login-check.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import { useLoginCheck } from '@/hooks/useLoginCheck';

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  (uni.navigateTo as any).mockReset();
});

describe('useLoginCheck', () => {
  it('未登录 → navigateTo /pages/login/index,不调 callback', () => {
    const { checkLogin } = useLoginCheck();
    const cb = vi.fn();
    checkLogin(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });

  it('已登录 → 调 callback,不导航', () => {
    useAuth().setSession(
      { accessToken: 'a', refreshToken: 'r' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const { checkLogin } = useLoginCheck();
    const cb = vi.fn();
    checkLogin(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(uni.navigateTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step C2.3: commit**

```bash
git add apps/miniapp-uni/src/hooks/useLoginCheck.ts apps/miniapp-uni/src/__tests__/hooks-login-check.test.ts
git commit -m "feat(miniapp-uni): useLoginCheck hook + 2 用例"
```

---

## Task C3: useRefreshList hook

**Files:**
- Create: `apps/miniapp-uni/src/hooks/useRefreshList.ts`
- Create: `apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts`

- [ ] **Step C3.1: 写 `src/hooks/useRefreshList.ts`**

参考 Art-app `useRefreshList.js`，但**对齐后端分页契约**——本仓库 `apps/api` 返回的列表用 `{ items, total }` 还是 `{ records, total }`？plan B 不依赖具体字段，plan C 这一层抽象 `extract` 选项让业务页注入：

```ts
import { ref, type Ref } from 'vue';

export type RefreshState = 'none' | 'refreshing';
export type LoadState = 'none' | 'loading' | 'empty' | 'ended';

export interface UseRefreshListOpts<T, Q extends Record<string, any> = any> {
  /** 每页大小,默认 20 */
  pageSize?: number;
  /** 业务侧动态搜索参数 */
  getSearchParams?: () => Q;
  /** 后端响应 → { records, total }。默认尝试 r.items ?? r.records,r.total */
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

/**
 * 列表下拉刷新 + 上拉加载 hook。状态机:
 *   refreshing: 'none' | 'refreshing'
 *   loading: 'none' | 'loading' | 'empty' | 'ended'
 *
 * 用法:
 *   const list = useRefreshList(
 *     (params) => requestsApi.listMine(),
 *     { extract: (r) => ({ records: r.items ?? r, total: r.total ?? r.length }) },
 *   );
 *   onShow(() => list.fetchListRefresh());
 */
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
        /* H5 无此 API,忽略 */
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
```

- [ ] **Step C3.2: 写 `src/__tests__/hooks-refresh-list.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { useRefreshList } from '@/hooks/useRefreshList';

describe('useRefreshList', () => {
  it('refresh 拉第一页,数据 + total + loading=none', async () => {
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
```

- [ ] **Step C3.3: commit**

```bash
git add apps/miniapp-uni/src/hooks/useRefreshList.ts apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts
git commit -m "feat(miniapp-uni): useRefreshList hook（5 态状态机 + 4 用例）"
```

---

## Task C4: NavBar 组件

**Files:**
- Create: `apps/miniapp-uni/src/components/nav-bar/nav-bar.vue`

- [ ] **Step C4.1: 写 `src/components/nav-bar/nav-bar.vue`**

```vue
<template>
  <view class="nav-bar-fixed" :style="containerStyle">
    <view class="nav-bar-content" :style="contentStyle">
      <view class="nav-bar-left" :style="leftSlotStyle">
        <slot name="left">
          <view
            v-if="showBack"
            class="nav-bar-back"
            @click="onBack"
          >
            <text class="nav-bar-back-icon">‹</text>
          </view>
        </slot>
      </view>
      <view class="nav-bar-center">
        <slot>
          <text class="nav-bar-title">{{ title }}</text>
        </slot>
      </view>
      <view class="nav-bar-right" :style="rightSlotStyle">
        <slot name="right" />
      </view>
    </view>
  </view>
  <!-- 撑开等高占位,避免内容被 fixed nav-bar 遮住 -->
  <view :style="placeholderStyle" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useWxCapsuleRect } from '@/hooks/useWxCapsuleRect';

interface Props {
  title?: string;
  showBack?: boolean;
  bgColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showBack: false,
  bgColor: '#ffffff',
});

const { statusBarHeight, navBarHeight, rect, capsuleRightSpace, update } =
  useWxCapsuleRect();

onMounted(() => update());
onShow(() => update());

// 总高度 = 状态栏 + 自定义导航栏高度
const totalHeight = computed(() => statusBarHeight.value + navBarHeight.value);

const containerStyle = computed(() => ({
  height: `${totalHeight.value}px`,
  backgroundColor: props.bgColor,
}));

const contentStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
  height: `${navBarHeight.value}px`,
}));

// 微信端 right slot 必须为胶囊留出空间,否则会被胶囊压住
const rightSlotStyle = computed(() => {
  if (!rect.value) return {};
  return { paddingRight: `${capsuleRightSpace.value}px` };
});

// 左侧返回按钮在微信端也要避开胶囊对侧的视觉对称(给 12px padding)
const leftSlotStyle = computed(() => ({
  paddingLeft: '12px',
}));

const placeholderStyle = computed(() => ({
  height: `${totalHeight.value}px`,
}));

function onBack() {
  uni.navigateBack();
}
</script>

<style lang="scss" scoped>
.nav-bar-fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}
.nav-bar-content {
  display: flex;
  align-items: center;
}
.nav-bar-left,
.nav-bar-right {
  display: flex;
  align-items: center;
  min-width: 80rpx;
}
.nav-bar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.nav-bar-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}
.nav-bar-back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-bar-back-icon {
  font-size: 48rpx;
  color: #1f2937;
  line-height: 1;
}
</style>
```

- [ ] **Step C4.2: commit**

```bash
git add apps/miniapp-uni/src/components/nav-bar
git commit -m "feat(miniapp-uni): NavBar 组件（左/中/右 slot + 微信胶囊避让）"
```

---

## Task C5: TabBar 组件（5 项 emerald）

**Files:**
- Create: `apps/miniapp-uni/src/components/tab-bar/tab-bar.vue`

- [ ] **Step C5.1: 写 `src/components/tab-bar/tab-bar.vue`**

参考 Art-app tab-bar.vue 改 5 项 + emerald 主色 + 用 `u-icon` 替代静态 png（避免 icon 资源管理）+ 已登录拦截改用 `useLoginCheck`：

```vue
<template>
  <view class="tab-bar-wrap">
    <view class="tab-bar">
      <view
        v-for="(item, index) in items"
        :key="item.pagePath"
        class="tab-bar-item"
        :class="{ active: current === index }"
        @click="onTap(item, index)"
      >
        <u-icon
          :name="current === index ? item.activeIcon : item.icon"
          :color="current === index ? '#10b981' : '#909193'"
          size="22"
        />
        <text class="tab-text" :class="{ active: current === index }">
          {{ $t(item.i18nKey) }}
        </text>
      </view>
    </view>
    <view class="safe-area-inset-bottom" />
  </view>
</template>

<script setup lang="ts">
import { useLoginCheck } from '@/hooks/useLoginCheck';

interface TabItem {
  pagePath: string;
  icon: string;
  activeIcon: string;
  i18nKey: string;
  requireLogin: boolean;
}

interface Props {
  current: number;
}

defineProps<Props>();

const { checkLogin } = useLoginCheck();

// 与 spec §6.1 IA 一致
const items: TabItem[] = [
  {
    pagePath: '/pages/home/index',
    icon: 'home',
    activeIcon: 'home-fill',
    i18nKey: 'tabBar.home',
    requireLogin: false,
  },
  {
    pagePath: '/pages/my-requests/index',
    icon: 'file-text',
    activeIcon: 'file-text-fill',
    i18nKey: 'tabBar.myRequests',
    requireLogin: true,
  },
  {
    pagePath: '/pages/approvals/index',
    icon: 'checkmark-circle',
    activeIcon: 'checkmark-circle-fill',
    i18nKey: 'tabBar.approvals',
    requireLogin: true,
  },
  {
    pagePath: '/pages/notifications/index',
    icon: 'bell',
    activeIcon: 'bell-fill',
    i18nKey: 'tabBar.notifications',
    requireLogin: true,
  },
  {
    pagePath: '/pages/mine/index',
    icon: 'account',
    activeIcon: 'account-fill',
    i18nKey: 'tabBar.mine',
    requireLogin: true,
  },
];

function onTap(item: TabItem, index: number) {
  if (index === (currentIndex())) return;
  const go = () => uni.reLaunch({ url: item.pagePath });
  if (item.requireLogin) {
    checkLogin(go);
  } else {
    go();
  }
}

function currentIndex(): number {
  // props.current 通过 setup 上下文不可直接拿,这里走 fallback——
  // 实际上 click 处理里直接比较 index 和 current 即可。
  return -1;
}
</script>

<style lang="scss" scoped>
.tab-bar-wrap {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 998;
  background: #ffffff;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.04);
}
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 100rpx;
}
.tab-bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.tab-text {
  font-size: 22rpx;
  color: #909193;
}
.tab-text.active {
  color: #10b981;
  font-weight: 600;
}
.safe-area-inset-bottom {
  height: env(safe-area-inset-bottom);
}
</style>
```

注意 `onTap` 里 `currentIndex()` 的 trick：`setup` 顶部已 `defineProps`，但在普通函数闭包里直接读 `props.current` 也可以。改成更直接的：

```ts
const props = defineProps<Props>();
function onTap(item: TabItem, index: number) {
  if (index === props.current) return;
  // ...
}
```

请用这个更直接的版本（删掉 `currentIndex()` 工具函数 + 移除 `defineProps<Props>();` 那行的无名形式）。

- [ ] **Step C5.2: commit**

```bash
git add apps/miniapp-uni/src/components/tab-bar
git commit -m "feat(miniapp-uni): TabBar 5 项 emerald + uview-plus icon + 登录拦截"
```

---

## Task C6: CustomBottomArea 组件

**Files:**
- Create: `apps/miniapp-uni/src/components/custom-bottom-area/custom-bottom-area.vue`

- [ ] **Step C6.1: 写 `src/components/custom-bottom-area/custom-bottom-area.vue`**

```vue
<template>
  <view class="custom-bottom-area" :style="style" />
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';

interface Props {
  bgColor?: string;
}
const props = withDefaults(defineProps<Props>(), {
  bgColor: 'transparent',
});

const safeBottom = ref(0);

onMounted(() => {
  try {
    const insets = uni.getSystemInfoSync().safeAreaInsets;
    safeBottom.value = insets?.bottom ?? 0;
  } catch {
    safeBottom.value = 0;
  }
});

const style = computed(() => ({
  height: safeBottom.value === 0 ? '0' : `${safeBottom.value * 2}rpx`,
  backgroundColor: props.bgColor,
}));
</script>

<style lang="scss" scoped>
.custom-bottom-area {
  width: 100%;
}
</style>
```

- [ ] **Step C6.2: commit**

```bash
git add apps/miniapp-uni/src/components/custom-bottom-area
git commit -m "feat(miniapp-uni): CustomBottomArea 安全区占位"
```

---

## Task C7: pages.json 扩 8 页

**Files:**
- Modify: `apps/miniapp-uni/src/pages.json`

- [ ] **Step C7.1: 改写 `src/pages.json`**

注意：与 plan A 一样不写 `tabBar` 段（自定义 tab-bar 接管）。主包 5 个 tab 页 + login + mine；`search` 和 `report-summary` 按 spec §6.2 放分包，但本 plan 暂全部塞主包简化（plan D / plan E 再考虑分包）。

```json
{
  "pages": [
    {
      "path": "pages/home/index",
      "style": {
        "navigationBarTitleText": "工作台",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/my-requests/index",
      "style": {
        "navigationBarTitleText": "我的申请",
        "enablePullDownRefresh": true,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/approvals/index",
      "style": {
        "navigationBarTitleText": "待办审批",
        "enablePullDownRefresh": true,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/notifications/index",
      "style": {
        "navigationBarTitleText": "消息",
        "enablePullDownRefresh": true,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/mine/index",
      "style": {
        "navigationBarTitleText": "我的",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/login/index",
      "style": {
        "navigationBarTitleText": "登录",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": {
          "titleNView": false,
          "popGesture": "none",
          "bounce": "none"
        }
      }
    },
    {
      "path": "pages/search/index",
      "style": {
        "navigationBarTitleText": "搜索试剂",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/report-summary/index",
      "style": {
        "navigationBarTitleText": "报表概览",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    }
  ],
  "easycom": {
    "autoscan": true,
    "custom": {
      "^up-(.*)": "@/uni_modules/uview-plus/components/u-$1/u-$1.vue",
      "^u-([^-].*)": "@/uni_modules/uview-plus/components/u-$1/u-$1.vue"
    }
  },
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "实验室试剂",
    "navigationBarBackgroundColor": "#ffffff",
    "backgroundColor": "#f5f5f5"
  }
}
```

注意 search / report-summary 也注册了占位 path，但本 plan **不创建对应页面文件**——dev:h5 下访问不到也没问题，它们留 plan D 创建。如果 `pnpm dev:h5` 报"页面不存在"，删掉这两段，留 plan D 再加。

- [ ] **Step C7.2: commit**

```bash
git add apps/miniapp-uni/src/pages.json
git commit -m "feat(miniapp-uni): pages.json 扩 5 tab + 隐藏 login（自定义 tab-bar 接管）"
```

---

## Task C8: 占位页改造为 5 tab 壳

**Files:**
- Modify: `apps/miniapp-uni/src/pages/home/index.vue`
- Modify: `apps/miniapp-uni/src/pages/login/index.vue`
- Modify: `apps/miniapp-uni/src/pages/mine/index.vue`
- Create: `apps/miniapp-uni/src/pages/my-requests/index.vue`
- Create: `apps/miniapp-uni/src/pages/approvals/index.vue`
- Create: `apps/miniapp-uni/src/pages/notifications/index.vue`

- [ ] **Step C8.1: 改写 `src/pages/home/index.vue` — 工作台壳**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.home')" />
    <view class="content p-32">
      <view v-if="user" class="card">
        <text class="text-primary block">{{ user.name }}</text>
        <text class="text-muted mt-8 block">{{ user.email }}</text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
        <view class="mt-16">
          <u-button type="primary" :text="$t('common.login')" @click="goLogin" />
        </view>
      </view>
      <view class="mt-32 entries">
        <u-cell-group>
          <u-cell :title="$t('tabBar.myRequests')" isLink @click="goMyRequests" />
          <u-cell :title="$t('tabBar.approvals')" isLink @click="goApprovals" />
          <u-cell title="搜索试剂" isLink @click="goSearch" />
          <u-cell title="报表概览" isLink @click="goReports" />
        </u-cell-group>
      </view>
    </view>
    <TabBar :current="0" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';

const auth = useAuth();
const user = computed(() => auth.user);

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
function goMyRequests() {
  uni.switchTab({ url: '/pages/my-requests/index' });
}
function goApprovals() {
  uni.switchTab({ url: '/pages/approvals/index' });
}
function goSearch() {
  uni.navigateTo({ url: '/pages/search/index' });
}
function goReports() {
  uni.navigateTo({ url: '/pages/report-summary/index' });
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx; // 给 tab-bar 留位
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.block {
  display: block;
}
.entries {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}
</style>
```

注意：plan B 临时塞在 home 的 login form 被挪到 login 占位页（C8.2）。

- [ ] **Step C8.2: 改写 `src/pages/login/index.vue` — 接收 plan B 的 login form**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('common.login')" showBack />
    <view class="content p-32">
      <view class="card">
        <u-form labelPosition="top">
          <u-form-item label="Email">
            <u-input v-model="form.email" placeholder="admin@lab.local" />
          </u-form-item>
          <u-form-item label="Password">
            <u-input
              v-model="form.password"
              type="password"
              placeholder="admin123"
            />
          </u-form-item>
        </u-form>
        <view class="mt-32">
          <u-button
            type="primary"
            :text="$t('common.login')"
            :loading="loading"
            @click="onLogin"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import { useAuth } from '@/stores/auth';
import { i18n } from '@/locale';
import * as authApi from '@/api/modules/auth';

const auth = useAuth();
const form = reactive({ email: 'admin@lab.local', password: 'admin123' });
const loading = ref(false);

async function onLogin() {
  loading.value = true;
  try {
    const tokens = await authApi.login(form);
    auth.setTokens(tokens);
    const u = await authApi.me();
    auth.setSession(tokens, u);
    uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
    setTimeout(() => uni.switchTab({ url: '/pages/home/index' }), 300);
  } catch {
    /* api/request.ts 已 toast */
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
</style>
```

- [ ] **Step C8.3: 改写 `src/pages/mine/index.vue` — 加 NavBar/TabBar 框**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.mine')" />
    <view class="content p-32">
      <view v-if="user" class="card">
        <text class="text-primary block">{{ user.name }}</text>
        <text class="text-muted mt-8 block">{{ user.email }}</text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
      </view>
      <view class="mt-32 card">
        <u-button :text="$t('common.logout')" @click="logout" v-if="user" />
      </view>
      <view class="mt-32 hint">
        <text class="text-muted">mine 页正式版留 plan D（含改密、语言切换、报表入口等）</text>
      </view>
    </view>
    <TabBar :current="4" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';

const auth = useAuth();
const user = computed(() => auth.user);

function logout() {
  auth.clear();
  uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.block {
  display: block;
}
.hint {
  text-align: center;
}
</style>
```

- [ ] **Step C8.4: 创建 `src/pages/my-requests/index.vue` — 占位**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.myRequests')" />
    <view class="content p-32">
      <view class="card">
        <text class="text-muted">my-requests 内容留 plan D</text>
      </view>
    </view>
    <TabBar :current="1" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 32rpx; }
</style>
```

- [ ] **Step C8.5: 创建 `src/pages/approvals/index.vue` — 占位**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.approvals')" />
    <view class="content p-32">
      <view class="card">
        <text class="text-muted">approvals 内容留 plan D</text>
      </view>
    </view>
    <TabBar :current="2" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 32rpx; }
</style>
```

- [ ] **Step C8.6: 创建 `src/pages/notifications/index.vue` — 占位**

```vue
<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.notifications')" />
    <view class="content p-32">
      <view class="card">
        <text class="text-muted">notifications 内容留 plan D</text>
      </view>
    </view>
    <TabBar :current="3" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 32rpx; }
</style>
```

- [ ] **Step C8.7: commit**

```bash
git add apps/miniapp-uni/src/pages
git commit -m "feat(miniapp-uni): 5 tab 占位页 + login 接收登录表单（plan B 临时面板拆出）"
```

---

## Task C9: 验收 + plan C 完成

无新代码，纯验证。

- [ ] **Step C9.1: 跑 vitest 全量**

```bash
pnpm --filter @app/miniapp-uni test
```

预期：
- plan A 4 用例（spike S1/S2×2/S3）
- plan B 29 用例（locale 4 + auth-store 5 + jwt 3 + request 9 + modules 6 + bootRefresh 2）
- plan C 9 用例（capsuleRect 2 + loginCheck 2 + refreshList 4）+ tab-bar inline 内不写组件测
- **合计 ≈42 用例**（与 INDEX "≈38" 偏多 4 个,因 refreshList 拆得更细;在可接受范围）

如某条 vitest 报 "process is not defined" / "uni is undefined"，检查 vitest.setup.ts 是否被 plan A 的配置正确加载。

- [ ] **Step C9.2: dev:h5 5 tab 切换验证**

启动后端 + miniapp-uni dev:

```bash
# 终端 1
pnpm --filter @app/api start:dev
# 终端 2
pnpm --filter @app/miniapp-uni dev:h5
```

浏览器 `http://localhost:3003`：

1. ✅ 默认进 home 页，看到 NavBar 显示"工作台"，底部 5 个 tab：工作台 / 申请 / 审批 / 消息 / 我的
2. ✅ 当前 tab "工作台" 高亮 emerald 色，其余灰
3. ✅ 未登录时点"申请"/"审批"/"消息"/"我的" → 跳到 /pages/login/index（loginCheck 生效）
4. ✅ login 页用 admin@lab.local/admin123 登录 → toast 操作成功 → 自动 switchTab 回 home
5. ✅ 再点 5 个 tab 都能切换；当前 tab 高亮正确
6. ✅ 各页 NavBar 标题不同（工作台 / 我的申请 / 待办审批 / 消息 / 我的）
7. ✅ 切换语言（mine 页暂无 UI，从 home 临时按钮触发？plan B 之后 home 临时按钮被删除——验收时手动 `i18n.global.locale.value = 'en'`，或临时在 home 加按钮验一次再删）→ tab 文字立即英文化
8. ✅ "我的"页点退出 → 回 login，store 已 clear

- [ ] **Step C9.3: 微信小程序端验收（如有微信开发者工具）**

```bash
pnpm --filter @app/miniapp-uni dev:mp-weixin
```

用微信开发者工具打开 `apps/miniapp-uni/dist/dev/mp-weixin/`，验：
- NavBar 顶部留出胶囊高度 + 状态栏（不被胶囊压住）
- right slot 范围避开胶囊（虽然现在 right slot 是空的，看占位是否正常）

如果没有微信开发者工具，**此步可跳过**，留 plan E 多端验收做。

- [ ] **Step C9.4: build:h5 验证**

```bash
pnpm --filter @app/miniapp-uni build:h5
```

预期：成功，产物 `dist/build/h5/`，体积 < 3 MB（多了一堆 uview 组件 + 5 页 vue，比 plan B 略大）。

- [ ] **Step C9.5: 写 plan C 完成 commit**

```bash
git status --short
git commit --allow-empty -m "chore(miniapp-uni): plan C (UI 骨架) 完成"
```

- [ ] **Step C9.6: 更新 MEMORY.md（可选）**

加一行到 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\MEMORY.md`：

```
- [miniapp-uni plan C 完成](project_miniapp_uni_plan_c_status.md) — NavBar/TabBar/3 hooks 全过,5 tab 切换 + 胶囊避让 OK
```

并创建 `project_miniapp_uni_plan_c_status.md`：

```markdown
---
name: miniapp-uni plan C 完成
description: UI 骨架(NavBar + 5tab + 3 hooks)就绪
type: project
---

完成 spec §4.2 / §4.3 / §4.4 / §4.5。

**已落地：**
- NavBar:左/中/右 slot + 微信胶囊避让(useWxCapsuleRect)
- TabBar:5 项 emerald + uview u-icon + 登录拦截(useLoginCheck)
- CustomBottomArea:安全区占位
- hooks:useWxCapsuleRect / useLoginCheck / useRefreshList
- pages:home 工作台壳 + login + my-requests/approvals/notifications/mine 占位
- pages.json:8 页(主包),tabBar 段不写

**验收：**
- vitest ≈42 用例全过(plan A 4 + plan B 29 + plan C 9)
- dev:h5 5 tab 切换 + 登录拦截 + NavBar 渲染都过

**遗留 TODO:**
- search / report-summary 页占位已注册但未创建页面文件,留 plan D
- 反馈封装(spec §4.4 modal/toast)走约定,不创建新组件,业务页直接用 uni.show* / u-modal
- 微信端 mp-weixin 真机/IDE 验收留 plan E
```

完成后即可进入 [Plan D（业务页迁移）](./2026-05-14-miniapp-uni-d-pages.md)。

---

## Plan C 验收标准

1. ✅ `pnpm --filter @app/miniapp-uni test` 全过，用例数 ≈42（plan A 4 + plan B 29 + plan C 9，允许 ±3）
2. ✅ `pnpm --filter @app/miniapp-uni dev:h5` 起得来，浏览器看到 5 tab 都能切换，NavBar 顶部正确占位
3. ✅ 未登录时点需登录 tab 自动跳 login；登录后 5 tab 都能进
4. ✅ login 页 admin@lab.local/admin123 登录后 switchTab 回 home
5. ✅ TabBar 当前项 emerald 高亮，文字随 locale 切换
6. ✅ `pnpm --filter @app/miniapp-uni build:h5` 成功，产物 < 3 MB
7. ✅ 老 `apps/miniapp`（Taro）仍可 `pnpm --filter @app/miniapp dev:h5`，不受影响

---

## 与 spec 的偏离说明

| spec 原文 | plan C 实现 | 理由 |
|---|---|---|
| §6.2 search / report-summary 属于 `package-business/pages/*` (分包) | pages.json 暂注册到主包路径,本 plan 仅占位 path | 分包需要 main package + subPackage 结构调整,留 plan D 一并做(避免本 plan 既改导航又改包结构,验收面太大) |
| §4.4 "反馈封装" | 不创建新 wrapper 组件,文档约定:Toast/Loading 走 `uni.show*`,Modal 走 `u-modal` | 一层 wrapper 没有抽象价值,直接用 uni 原生 API + uview-plus 即可 |
| §4.5 useRefreshList 状态机 + custom-refresh-list 组件 | 本 plan 只移植 hook,**不**移植 `custom-refresh-list.vue`(Art-app 145 行 scroll-view 包装) | 组件本身依赖 `scroll-view` 自定义 refresher,直接在业务页用 hook + 原生 scroll-view/u-list 即可,组件 wrapper 收益不大;如 plan D 业务页发现需要再补 |
| §6.2 home 页"快捷入口 + 用户头像+姓名+实验室" | 仅渲染快捷入口 + name + email | "实验室" 字段从 user.lab 推断,plan C 未验证种子数据是否填了 lab,占位先省;plan D 完善 |
