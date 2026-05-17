# miniapp-uni Plan E Implementation Plan — 状态层 UI + 视觉一致性

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 6 列表页统一加 loading 骨架 / error 占位 + retry / pull-down 刷新 / empty 一致化；提取 SCSS token 集合并替换 8 页 hardcoded 颜色/间距/圆角/字号。

**Architecture:** 6 commit 串行（E1-E6，对应 6 Task）。E1 立 tokens；E2 改 hook 加 error 分支（TDD，单测先行）；E3 抽 Skeleton/ErrorPlaceholder 通用组件；E4 把 4 列表页（search / my-requests / approvals / notifications）装上 status-layer + pull-down；E5 全量替换 8 页 hardcoded → token；E6 验收 + tag。bisect 友好——视觉问题可单独 revert E5，hook 问题可 revert E2。

**Tech Stack:** uniapp 3.0 + Vue 3.4 + TS + uview-plus（u-skeleton / u-empty / u-button）+ vue-i18n + pinia + vitest。

**Spec:** [`docs/superpowers/specs/2026-05-16-miniapp-uni-plan-e-design.md`](../specs/2026-05-16-miniapp-uni-plan-e-design.md)

**Base tag:** `plan-d-complete @ 68b0aae`
**Target tag:** `plan-e-complete`

**前置：** Plan D 完成；当前目录 `apps/miniapp-uni` 下 `npx vitest run` 43/43 pass，`npm run build:h5` 1.4MB 成功。

---

## File Structure

### 新增 3 个文件

| 路径 | 责任 |
|---|---|
| `apps/miniapp-uni/src/styles/tokens.scss` | 颜色 / 间距 / 圆角 / 字号 token 定义，全部 `$mp-` 前缀 |
| `apps/miniapp-uni/src/components/skeleton/skeleton.vue` | 列表页骨架占位，props: `count` / `rows` / `showTitle` / `showAvatar` |
| `apps/miniapp-uni/src/components/error-placeholder/error-placeholder.vue` | 列表页错误占位 + retry 按钮，props: `message`；emit: `retry` |

### 修改

| 路径 | 改动类型 |
|---|---|
| `apps/miniapp-uni/src/uni.scss` | 顶部追加 `@import '@/styles/tokens.scss';` |
| `apps/miniapp-uni/src/hooks/useRefreshList.ts` | 加 `'error'` LoadState / `lastError` ref / `retry()` / `fetchListData` catch |
| `apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts` | 新增 2 用例（error path + retry） |
| `apps/miniapp-uni/src/locale/zh-CN.ts` & `en.ts` | 新增 `common.empty` |
| `apps/miniapp-uni/src/pages/search/index.vue` | 状态层模板 + token 替换 |
| `apps/miniapp-uni/src/pages/my-requests/index.vue` | 状态层模板 ×2 tab + `onPullDownRefresh` + token 替换 |
| `apps/miniapp-uni/src/pages/approvals/index.vue` | 自维护 loading/error refs + Skeleton + ErrorPlaceholder + `onPullDownRefresh` + token 替换 |
| `apps/miniapp-uni/src/pages/notifications/index.vue` | 状态层模板 + `onPullDownRefresh` + token 替换 |
| `apps/miniapp-uni/src/pages/home/index.vue` | 仅 token 替换（无状态层） |
| `apps/miniapp-uni/src/pages/report-summary/index.vue` | 仅 token 替换（per-card state 保留） |
| `apps/miniapp-uni/src/pages/login/index.vue` | 仅 token 替换（padding 保留 32rpx） |
| `apps/miniapp-uni/src/pages/mine/index.vue` | 仅 token 替换 |

### 不动

- `NavBar` / `TabBar` / `CustomBottomArea`（已稳定）
- `api/request.ts` / `stores/auth.ts` / `api/modules/*`
- `pages.json`（pull-down 配置已在 D 阶段就位）

---

## Task 1: E1 — tokens.scss 立基

**Files:**
- Create: `apps/miniapp-uni/src/styles/tokens.scss`
- Modify: `apps/miniapp-uni/src/uni.scss:2-3`

- [ ] **Step 1: 新建 tokens.scss**

写入 `apps/miniapp-uni/src/styles/tokens.scss`：

```scss
// src/styles/tokens.scss
// Plan E tokens — 用 $mp- 前缀避免与 $uni-* / uview $u-* 命名冲突

// === 颜色 ===
$mp-color-primary: #10b981;
$mp-color-primary-dark: #059669;
$mp-color-bg: #f5f5f5;
$mp-color-card: #fff;
$mp-color-card-alt: #fafafa;            // notifications 已读
$mp-color-card-unread: #fffbe6;         // notifications 未读
$mp-color-text-primary: #1f2937;
$mp-color-text-secondary: #4b5563;
$mp-color-text-tertiary: #6b7280;
$mp-color-text-muted: #9ca3af;
$mp-color-error: #ef4444;
$mp-color-error-dark: #d4380d;
$mp-color-warn: #d97706;

// === 间距（rpx，8 倍数） ===
$mp-spacing-1: 8rpx;
$mp-spacing-2: 16rpx;
$mp-spacing-3: 24rpx;     // 默认页 / 卡片 padding
$mp-spacing-4: 32rpx;
$mp-spacing-6: 48rpx;
$mp-spacing-8: 64rpx;

// === 圆角 ===
$mp-radius-sm: 8rpx;
$mp-radius-md: 16rpx;     // 卡片标准
$mp-radius-lg: 24rpx;

// === 字号 ===
$mp-text-xs: 22rpx;       // meta tiny
$mp-text-sm: 24rpx;       // meta
$mp-text-base: 26rpx;     // body
$mp-text-md: 28rpx;       // 卡片标题
$mp-text-lg: 30rpx;       // 大标题
$mp-text-xl: 36rpx;       // user-card 名字
$mp-text-2xl: 48rpx;      // report 大数字
```

- [ ] **Step 2: 在 uni.scss 顶部 import tokens**

修改 `apps/miniapp-uni/src/uni.scss`，把当前的第 2 行后追加一行 import：

把：
```scss
@import '@/uni_modules/uni-scss/variables.scss';
@import '@/uni_modules/uview-plus/theme.scss';

/* 颜色变量 */
```

改为：
```scss
@import '@/uni_modules/uni-scss/variables.scss';
@import '@/uni_modules/uview-plus/theme.scss';
@import '@/styles/tokens.scss';

/* 颜色变量 */
```

- [ ] **Step 3: 跑 vitest 确认无回归**

Run（在 `apps/miniapp-uni/` 下）：
```bash
npx vitest run
```
Expected: 43 passed（不能少于 43）。

- [ ] **Step 4: 跑 build:h5 确认 SCSS 编译通过**

Run：
```bash
npm run build:h5
```
Expected: build 成功，无 SCSS 报错。dist 体积 1.4MB ± 50KB。

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp-uni/src/styles/tokens.scss apps/miniapp-uni/src/uni.scss
git commit -m "feat(miniapp-uni): E1 新增 tokens.scss + uni.scss 引入"
```

---

## Task 2: E2 — useRefreshList 加 error 分支（TDD）

**Files:**
- Modify: `apps/miniapp-uni/src/hooks/useRefreshList.ts`（整文件）
- Modify: `apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts`（追加 2 用例）

- [ ] **Step 1: 先写两条失败测试（TDD）**

在 `apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts` 末尾、最后一个 `})`（关闭 describe）之前，插入：

```typescript
  it('API reject → loading=error 且 lastError 含 message', async () => {
    const api = vi.fn().mockRejectedValue(new Error('boom'));
    const list = useRefreshList<any>(api);
    await list.fetchListRefresh();
    expect(list.loading.value).toBe('error');
    expect(list.lastError.value).toContain('boom');
    expect(list.loadingFlag.value).toBe(false);
    expect(list.refreshing.value).toBe('none');
  });

  it('retry() 复位状态并重新拉取成功', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 });
    const list = useRefreshList<any>(api);
    await list.fetchListRefresh();
    expect(list.loading.value).toBe('error');
    await list.retry();
    expect(api).toHaveBeenCalledTimes(2);
    expect(list.dataList.value).toEqual([{ id: 1 }]);
    expect(list.loading.value).toBe('ended'); // total=1 pageSize=20 → ended
    expect(list.lastError.value).toBeNull();
  });
```

- [ ] **Step 2: 跑测试确认这 2 条 fail（其它 4 条仍 pass）**

Run：
```bash
npx vitest run src/__tests__/hooks-refresh-list.test.ts
```
Expected: 4 passed, 2 failed。失败原因类似 `list.lastError is undefined` / `list.retry is not a function`。

- [ ] **Step 3: 改 useRefreshList.ts 让 6 条用例全过**

把 `apps/miniapp-uni/src/hooks/useRefreshList.ts` 整文件替换为：

```typescript
import { ref, type Ref } from 'vue';

export type RefreshState = 'none' | 'refreshing';
export type LoadState = 'none' | 'loading' | 'empty' | 'ended' | 'error';

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
  lastError: Ref<string | null>;
  fetchListData: () => Promise<void>;
  fetchListRefresh: () => Promise<void>;
  fetchListLoad: () => Promise<void>;
  resetListData: () => void;
  retry: () => Promise<void>;
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
  const lastError = ref<string | null>(null);

  async function fetchListData() {
    if (firstFlag.value) loadingFlag.value = true;
    lastError.value = null;
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
    } catch (e: any) {
      loading.value = 'error';
      lastError.value = e?.message ?? '加载失败';
      // 不 rethrow（api/request.ts 已 toast）
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
    lastError.value = null;
  }

  async function retry() {
    pageNum.value = 1;
    totalRows.value = 0;
    firstFlag.value = true;
    loading.value = 'none';
    lastError.value = null;
    await fetchListData();
  }

  return {
    refreshing,
    loading,
    pageNum,
    totalRows,
    dataList,
    loadingFlag,
    lastError,
    fetchListData,
    fetchListRefresh,
    fetchListLoad,
    resetListData,
    retry,
  };
}
```

- [ ] **Step 4: 跑测试确认 6 条全过**

Run：
```bash
npx vitest run src/__tests__/hooks-refresh-list.test.ts
```
Expected: 6 passed, 0 failed。

- [ ] **Step 5: 跑全量 vitest 确认整个套件不退化**

Run：
```bash
npx vitest run
```
Expected: 45 passed（原 43 + 新 2，无失败）。

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp-uni/src/hooks/useRefreshList.ts apps/miniapp-uni/src/__tests__/hooks-refresh-list.test.ts
git commit -m "feat(miniapp-uni): E2 useRefreshList 加 error/lastError/retry + 单测 +2 用例（共 6）"
```

---

## Task 3: E3 — Skeleton + ErrorPlaceholder 通用组件 + i18n

**Files:**
- Create: `apps/miniapp-uni/src/components/skeleton/skeleton.vue`
- Create: `apps/miniapp-uni/src/components/error-placeholder/error-placeholder.vue`
- Modify: `apps/miniapp-uni/src/locale/zh-CN.ts:27`（toast 段后追加 common.empty 已存在则跳）
- Modify: `apps/miniapp-uni/src/locale/en.ts:27`

- [ ] **Step 1: 新建 Skeleton 组件目录 + 文件**

Run（在仓库根目录）：
```bash
mkdir -p apps/miniapp-uni/src/components/skeleton
```

写入 `apps/miniapp-uni/src/components/skeleton/skeleton.vue`：

```vue
<template>
  <view class="skeleton-list">
    <view v-for="i in count" :key="i" class="skeleton-card">
      <u-skeleton
        :loading="true"
        :animate="true"
        :rows="rows"
        :title="showTitle"
        :avatar="showAvatar"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props {
  count?: number;
  rows?: number;
  showTitle?: boolean;
  showAvatar?: boolean;
}
withDefaults(defineProps<Props>(), {
  count: 3,
  rows: 2,
  showTitle: true,
  showAvatar: false,
});
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.skeleton-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
  &:first-child {
    margin-top: 0;
  }
}
</style>
```

- [ ] **Step 2: 新建 ErrorPlaceholder 组件目录 + 文件**

Run：
```bash
mkdir -p apps/miniapp-uni/src/components/error-placeholder
```

写入 `apps/miniapp-uni/src/components/error-placeholder/error-placeholder.vue`：

```vue
<template>
  <view class="error-placeholder">
    <text class="error-icon">⚠</text>
    <text class="error-text block">
      {{ message || $t('toast.requestFailed') }}
    </text>
    <view class="retry-wrap">
      <u-button
        size="mini"
        :text="$t('common.retry')"
        @click="$emit('retry')"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props {
  message?: string;
}
defineProps<Props>();
defineEmits<{ retry: [] }>();
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $mp-spacing-6 0;
}
.error-icon {
  font-size: $mp-text-2xl;
  color: $mp-color-error;
}
.error-text {
  margin-top: $mp-spacing-2;
  font-size: $mp-text-base;
  color: $mp-color-text-tertiary;
}
.retry-wrap {
  margin-top: $mp-spacing-2;
}
.block {
  display: block;
}
</style>
```

- [ ] **Step 3: 加 common.empty i18n（zh-CN）**

修改 `apps/miniapp-uni/src/locale/zh-CN.ts`，把 `toast` 段：

```typescript
  toast: {
    loading: '加载中...',
    requestFailed: '请求失败',
    networkError: '网络异常',
    sessionExpired: '会话已失效',
    success: '操作成功',
    loginFirst: '请先登录',
    noResults: '无结果',
    noNotifications: '暂无消息',
  },
```

之上 / `common` 段的最后一项 `unassigned: '未分配'` 后追加一行（在闭合 `}` 前）：

```typescript
    empty: '暂无数据',
```

最终 `common` 段：
```typescript
  common: {
    submit: '提交',
    cancel: '取消',
    confirm: '确认',
    retry: '重试',
    readAll: '全部已读',
    logout: '退出登录',
    approve: '通过',
    reject: '拒绝',
    save: '保存',
    delete: '删除',
    back: '返回',
    login: '登录',
    unassigned: '未分配',
    empty: '暂无数据',
  },
```

- [ ] **Step 4: 加 common.empty i18n（en）**

同理修改 `apps/miniapp-uni/src/locale/en.ts`，`common` 段末尾追加：

```typescript
    empty: 'No data',
```

最终 `common` 段：
```typescript
  common: {
    submit: 'Submit',
    cancel: 'Cancel',
    confirm: 'Confirm',
    retry: 'Retry',
    readAll: 'Read all',
    logout: 'Log out',
    approve: 'Approve',
    reject: 'Reject',
    save: 'Save',
    delete: 'Delete',
    back: 'Back',
    login: 'Log in',
    unassigned: 'Unassigned',
    empty: 'No data',
  },
```

- [ ] **Step 5: 跑 vitest 确认 i18n 解析无错**

Run：
```bash
npx vitest run
```
Expected: 45 passed（与 E2 终态一致）。

- [ ] **Step 6: 跑 build:h5 确认 import 路径解析正常**

Run：
```bash
npm run build:h5
```
Expected: 成功。dist 体积 1.4MB ± 50KB（u-skeleton 通过 easycom 接入，已在 uview-plus bundle 内，不增包）。

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp-uni/src/components/skeleton apps/miniapp-uni/src/components/error-placeholder apps/miniapp-uni/src/locale/zh-CN.ts apps/miniapp-uni/src/locale/en.ts
git commit -m "feat(miniapp-uni): E3 新增 Skeleton + ErrorPlaceholder 通用组件 + common.empty"
```

---

## Task 4: E4 — 4 列表页装状态层 UI + 补 pull-down

**Files:**
- Modify: `apps/miniapp-uni/src/pages/search/index.vue`
- Modify: `apps/miniapp-uni/src/pages/my-requests/index.vue`
- Modify: `apps/miniapp-uni/src/pages/approvals/index.vue`
- Modify: `apps/miniapp-uni/src/pages/notifications/index.vue`

> 说明：home（无 list）/ report-summary（per-card 已有 state）/ login（表单）/ mine（设置页）四页本 task 不动状态层，留到 E5 只换 token。

- [ ] **Step 1: search 页改状态层模板**

修改 `apps/miniapp-uni/src/pages/search/index.vue`：

1. `<script setup lang="ts">` 顶部 import 区追加：
   ```typescript
   import Skeleton from '@/components/skeleton/skeleton.vue';
   import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
   ```

2. 把 `<view class="mt-24">` 内、`<view v-if="list.loading.value === 'empty'"...>` 那个块整段（包括下面的 `v-for` 列表）替换为：
   ```vue
   <view class="mt-24">
     <Skeleton v-if="list.loadingFlag.value" :count="3" :rows="2" />
     <ErrorPlaceholder
       v-else-if="list.loading.value === 'error'"
       :message="list.lastError.value || undefined"
       @retry="list.retry"
     />
     <view v-else-if="list.loading.value === 'empty'" class="empty">
       <u-empty :text="$t('common.empty')" />
     </view>
     <view v-else>
       <view
         v-for="r in list.dataList.value"
         :key="r.id"
         class="reagent-card"
       >
         <view class="reagent-head">
           <text class="reagent-name">{{ r.name }}</text>
           <u-tag
             v-if="isControlled(r)"
             type="error"
             text="管控"
             plain
             size="mini"
           />
         </view>
         <text v-if="r.cas" class="reagent-meta block">CAS: {{ r.cas }}</text>
         <text class="reagent-meta block">等级: {{ r.hazardLevel }}</text>
       </view>
     </view>
   </view>
   ```

- [ ] **Step 2: my-requests 页改状态层模板 ×2 tab + onPullDownRefresh**

修改 `apps/miniapp-uni/src/pages/my-requests/index.vue`：

1. `<script setup lang="ts">` 顶部 import 区追加：
   ```typescript
   import { onPullDownRefresh } from '@dcloudio/uni-app';
   import Skeleton from '@/components/skeleton/skeleton.vue';
   import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
   ```
   注意：`onShow` 已在 import；`onPullDownRefresh` 与 `onShow` 同一 import 行可合并：
   ```typescript
   import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
   ```

2. 在 use tab 内，把 `<view class="mt-16">` 块里的 `<view v-if="reqList.loading.value === 'empty'"...>` 与紧随其后的 `<view v-for="r in reqList.dataList.value"...>` 整段替换为：
   ```vue
   <view class="mt-16">
     <Skeleton v-if="reqList.loadingFlag.value" :count="3" :rows="2" />
     <ErrorPlaceholder
       v-else-if="reqList.loading.value === 'error'"
       :message="reqList.lastError.value || undefined"
       @retry="reqList.retry"
     />
     <view v-else-if="reqList.loading.value === 'empty'" class="empty">
       <u-empty :text="$t('common.empty')" />
     </view>
     <view v-else>
       <view
         v-for="r in reqList.dataList.value"
         :key="r.id"
         class="req-card"
       >
         <view class="row-between">
           <text class="req-name">{{ r.reagent?.name ?? r.reagentId }}</text>
           <text class="req-status" :class="`status-${r.status}`">
             {{ r.status }}
           </text>
         </view>
         <text class="req-line block">{{ r.quantity }} {{ r.unit }}</text>
         <text v-if="r.purpose" class="req-line block">{{ r.purpose }}</text>
         <view v-if="r.status === 'PENDING'" class="mt-8">
           <u-button
             size="mini"
             :text="$t('common.cancel')"
             @click="cancelUse(r.id)"
           />
         </view>
       </view>
     </view>
   </view>
   ```

3. 在 purchase tab 内，把 `<view class="mt-16">` 块里的 `<view v-if="purList.loading.value === 'empty'"...>` 与紧随其后的 `<view v-for="p in purList.dataList.value"...>` 整段替换为：
   ```vue
   <view class="mt-16">
     <Skeleton v-if="purList.loadingFlag.value" :count="3" :rows="2" />
     <ErrorPlaceholder
       v-else-if="purList.loading.value === 'error'"
       :message="purList.lastError.value || undefined"
       @retry="purList.retry"
     />
     <view v-else-if="purList.loading.value === 'empty'" class="empty">
       <u-empty :text="$t('common.empty')" />
     </view>
     <view v-else>
       <view
         v-for="p in purList.dataList.value"
         :key="p.id"
         class="req-card"
       >
         <view class="row-between">
           <text class="req-name">{{ p.reagent?.name ?? p.reagentId }}</text>
           <text class="req-status" :class="`status-${p.status}`">
             {{ p.status }}
           </text>
         </view>
         <text class="req-line block">{{ p.quantity }} {{ p.unit }}</text>
         <text v-if="p.reason" class="req-line block">{{ p.reason }}</text>
         <view v-if="p.status === 'PENDING'" class="mt-8">
           <u-button
             size="mini"
             :text="$t('common.cancel')"
             @click="cancelPurchase(p.id)"
           />
         </view>
       </view>
     </view>
   </view>
   ```

4. 在文件末尾 `onShow(() => refreshAll());` 之后追加：
   ```typescript
   onPullDownRefresh(() => refreshAll());
   ```

- [ ] **Step 3: approvals 页加自维护 loading/error refs + onPullDownRefresh + 状态层模板**

修改 `apps/miniapp-uni/src/pages/approvals/index.vue`：

1. `<script setup lang="ts">` 顶部 import 区追加：
   ```typescript
   import { onPullDownRefresh } from '@dcloudio/uni-app';
   import Skeleton from '@/components/skeleton/skeleton.vue';
   import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
   ```
   合并到现有 `import { onShow } from '@dcloudio/uni-app';`：
   ```typescript
   import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
   ```

2. 在 `const reqs = ref<ReqRow[]>([]);` 之前追加 4 个 ref：
   ```typescript
   const reqsLoading = ref(true);
   const reqsError = ref<string | null>(null);
   const purLoading = ref(true);
   const purError = ref<string | null>(null);
   ```

3. 替换 `refresh()` 函数为：
   ```typescript
   async function refresh() {
     reqsLoading.value = true;
     reqsError.value = null;
     purLoading.value = true;
     purError.value = null;
     try {
       const [r, p] = await Promise.all([
         requestsApi.listPending(),
         purchasesApi.listPending(),
       ]);
       reqs.value = (r as ReqRow[]) ?? [];
       const g: Record<string, BatchGroup> = {};
       for (const item of (p as PurRow[]) ?? []) {
         if (!item.batch || item.batch.status !== 'PENDING') continue;
         if (!g[item.batch.id]) g[item.batch.id] = { batch: item.batch, items: [] };
         g[item.batch.id].items.push(item);
       }
       groups.value = g;
     } catch (e: any) {
       const msg = e?.message ?? '加载失败';
       reqsError.value = msg;
       purError.value = msg;
     } finally {
       reqsLoading.value = false;
       purLoading.value = false;
       try {
         uni.stopPullDownRefresh();
       } catch {
         /* H5 无此 API */
       }
     }
   }
   ```

4. 在文件末尾 `onShow(() => refresh());` 之后追加：
   ```typescript
   onPullDownRefresh(() => refresh());
   ```

5. 在 use tab 模板内，把 `<view v-if="tab === 'use'" class="tab-pane mt-16">` 块内的：
   ```vue
   <view v-if="reqs.length === 0" class="empty">
     <u-empty :text="$t('approvals.emptyUse')" />
   </view>
   <view v-for="r in reqs" :key="r.id" class="approval-card">
     ...
   </view>
   ```
   替换为：
   ```vue
   <Skeleton v-if="reqsLoading" :count="3" :rows="2" />
   <ErrorPlaceholder
     v-else-if="reqsError"
     :message="reqsError || undefined"
     @retry="refresh"
   />
   <view v-else-if="reqs.length === 0" class="empty">
     <u-empty :text="$t('common.empty')" />
   </view>
   <view v-else>
     <view v-for="r in reqs" :key="r.id" class="approval-card">
       <view class="row-between">
         <text class="approval-title">
           {{ r.reagent?.name ?? r.reagentId }}
           <text v-if="isControlled(r)" class="tag-controlled">
             【{{ $t('approvals.controlled') }}】
           </text>
         </text>
       </view>
       <text class="approval-meta block">
         {{ r.applicant?.name ?? r.applicantId }} · {{ r.quantity }}
         {{ r.unit }}
       </text>
       <text class="approval-meta block">
         {{ $t('form.purpose') }}：{{ r.purpose }}
       </text>
       <u-textarea
         v-model="comments[r.id]"
         :placeholder="$t('approvals.remark')"
         :count="false"
         :autoHeight="true"
         class="mt-8"
       />
       <view class="btn-row mt-8">
         <u-button
           size="mini"
           type="primary"
           :text="$t('approvals.approve1')"
           @click="decideUse(r.id, 'APPROVE', 1)"
         />
         <u-button
           size="mini"
           :text="$t('approvals.reject1')"
           @click="decideUse(r.id, 'REJECT', 1)"
         />
         <template v-if="isControlled(r)">
           <u-button
             size="mini"
             type="primary"
             :text="$t('approvals.approve2')"
             @click="decideUse(r.id, 'APPROVE', 2)"
           />
           <u-button
             size="mini"
             :text="$t('approvals.reject2')"
             @click="decideUse(r.id, 'REJECT', 2)"
           />
         </template>
       </view>
     </view>
   </view>
   ```

6. 在 purchase tab 模板内，把 `<view v-else class="tab-pane mt-16">` 块内的：
   ```vue
   <view v-if="batchList.length === 0" class="empty">
     <u-empty :text="$t('approvals.emptyPurchase')" />
   </view>
   <view v-for="g in batchList" :key="g.batch.id" class="approval-card">
     ...
   </view>
   ```
   替换为：
   ```vue
   <Skeleton v-if="purLoading" :count="3" :rows="2" />
   <ErrorPlaceholder
     v-else-if="purError"
     :message="purError || undefined"
     @retry="refresh"
   />
   <view v-else-if="batchList.length === 0" class="empty">
     <u-empty :text="$t('common.empty')" />
   </view>
   <view v-else>
     <view
       v-for="g in batchList"
       :key="g.batch.id"
       class="approval-card"
     >
       <text class="approval-title block">
         {{ $t('approvals.batch') }} {{ g.batch.id }}
       </text>
       <text class="approval-meta block">
         {{ $t('form.reagent') }} {{ g.batch.reagentId }} ·
         {{ g.batch.totalQty }} {{ g.batch.unit }}
       </text>
       <view class="batch-items">
         <text
           v-for="i in g.items"
           :key="i.id"
           class="batch-line block"
         >
           - {{ i.applicant?.name ?? i.applicantId }}: {{ i.quantity }}
           {{ i.unit }}（{{ i.reason }}）
         </text>
       </view>
       <u-textarea
         v-model="comments[g.batch.id]"
         :placeholder="$t('approvals.remark')"
         :count="false"
         :autoHeight="true"
         class="mt-8"
       />
       <view class="btn-row mt-8">
         <u-button
           size="mini"
           type="primary"
           :text="$t('common.approve')"
           @click="decideBatch(g.batch.id, 'APPROVE')"
         />
         <u-button
           size="mini"
           :text="$t('common.reject')"
           @click="decideBatch(g.batch.id, 'REJECT')"
         />
       </view>
     </view>
   </view>
   ```

- [ ] **Step 4: notifications 页改状态层模板 + onPullDownRefresh**

修改 `apps/miniapp-uni/src/pages/notifications/index.vue`：

1. `<script setup lang="ts">` 顶部 import 区追加：
   ```typescript
   import Skeleton from '@/components/skeleton/skeleton.vue';
   import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
   ```
   合并 `import { onShow } from '@dcloudio/uni-app';` 为：
   ```typescript
   import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
   ```

2. 把 `<view class="content p-24">` 内的 `<view v-if="list.loading.value === 'empty'"...>` 块及紧随的 `<view v-for="n in list.dataList.value"...>` 整段替换为：
   ```vue
   <view class="content p-24">
     <Skeleton v-if="list.loadingFlag.value" :count="3" :rows="2" />
     <ErrorPlaceholder
       v-else-if="list.loading.value === 'error'"
       :message="list.lastError.value || undefined"
       @retry="list.retry"
     />
     <view v-else-if="list.loading.value === 'empty'" class="empty">
       <u-empty :text="$t('common.empty')" />
     </view>
     <view v-else>
       <view
         v-for="n in list.dataList.value"
         :key="n.id"
         class="noti-card"
         :class="{ unread: !n.readAt }"
         @click="onTap(n)"
       >
         <text class="noti-title">{{ n.title }}</text>
         <text class="noti-body block">{{ n.body }}</text>
         <text class="noti-meta block">
           {{ formatDate(n.createdAt) }}{{ n.readAt ? ' · 已读' : '' }}
         </text>
       </view>
     </view>
   </view>
   ```

3. 在文件末尾 `onShow(() => list.fetchListRefresh());` 之后追加：
   ```typescript
   onPullDownRefresh(() => list.fetchListRefresh());
   ```

- [ ] **Step 5: 跑 vitest 确认无回归**

Run：
```bash
npx vitest run
```
Expected: 45 passed。

- [ ] **Step 6: 跑 build:h5 确认 4 页编译通过**

Run：
```bash
npm run build:h5
```
Expected: 成功，无 template 编译错误。dist 体积 1.4MB ± 50KB。

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp-uni/src/pages/search/index.vue apps/miniapp-uni/src/pages/my-requests/index.vue apps/miniapp-uni/src/pages/approvals/index.vue apps/miniapp-uni/src/pages/notifications/index.vue
git commit -m "feat(miniapp-uni): E4 4 列表页装状态层 UI + 补 pull-down + 统一 empty"
```

---

## Task 5: E5 — 8 页全量 hardcoded → SCSS token

> 总原则：颜色用 `$mp-color-*`、间距用 `$mp-spacing-*`、圆角用 `$mp-radius-*`、字号用 `$mp-text-*`。**每页 `<style scoped>` 顶部加 `@import '@/styles/tokens.scss';`**。统一规则：所有页面 content 内边距 24rpx（`$mp-spacing-3`），卡片 padding 24rpx（`$mp-spacing-3`）。**login 单独保留 32rpx**（表单页空间感需要）。

- [ ] **Step 1: home/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/home/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
}
.user-card {
  background: linear-gradient(
    135deg,
    $mp-color-primary 0%,
    $mp-color-primary-dark 100%
  );
  color: #fff;
}
.user-name {
  font-size: $mp-text-xl;
  font-weight: bold;
  color: #fff;
}
.user-email {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-base;
  color: rgba(255, 255, 255, 0.85);
}
.user-lab {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: rgba(255, 255, 255, 0.75);
}
.block {
  display: block;
}
.entries {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.unread {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3 $mp-spacing-4;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.unread-text {
  font-size: $mp-text-md;
}
</style>
```

注意：home 模板里 `<view class="content p-32">` 改为 `<view class="content p-24">`（统一为 24rpx）。

- [ ] **Step 2: search/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/search/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-2 $mp-spacing-3;
}
.reagent-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.reagent-head {
  display: flex;
  align-items: center;
  gap: $mp-spacing-2;
}
.reagent-name {
  font-size: $mp-text-lg;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.reagent-meta {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: $mp-color-text-tertiary;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: $mp-spacing-8 0;
}
</style>
```

- [ ] **Step 3: my-requests/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/my-requests/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.tabs-bar {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
}
.form-title {
  font-size: $mp-text-lg;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.controlled-hint {
  margin-top: 12rpx;
  font-size: $mp-text-sm;
  color: $mp-color-error;
}
.req-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.req-name {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.req-status {
  font-size: $mp-text-xs;
  color: $mp-color-text-tertiary;
}
.status-PENDING {
  color: $mp-color-warn;
}
.status-APPROVED,
.status-ISSUED,
.status-CLOSED,
.status-MERGED {
  color: $mp-color-primary;
}
.status-REJECTED,
.status-CANCELLED {
  color: $mp-color-error;
}
.req-line {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: $mp-color-text-secondary;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: $mp-spacing-8 0;
}
</style>
```

- [ ] **Step 4: approvals/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/approvals/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.tabs-bar {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.approval-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.approval-title {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.tag-controlled {
  color: $mp-color-error;
  font-weight: normal;
  font-size: $mp-text-sm;
}
.approval-meta {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: $mp-color-text-secondary;
}
.batch-items {
  margin-top: $mp-spacing-1;
  padding: $mp-spacing-1 0;
}
.batch-line {
  font-size: $mp-text-sm;
  color: $mp-color-text-tertiary;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: $mp-spacing-8 0;
}
</style>
```

- [ ] **Step 5: notifications/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/notifications/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.noti-card {
  background: $mp-color-card-alt;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.noti-card.unread {
  background: $mp-color-card-unread;
}
.noti-title {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.noti-body {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-base;
  color: $mp-color-text-secondary;
}
.noti-meta {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-xs;
  color: $mp-color-text-muted;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: $mp-spacing-8 0;
}
</style>
```

- [ ] **Step 6: report-summary/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/report-summary/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.report-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.report-label {
  font-size: $mp-text-base;
  color: $mp-color-text-tertiary;
}
.report-value {
  display: block;
  margin-top: $mp-spacing-2;
  font-size: $mp-text-2xl;
  font-weight: bold;
  color: $mp-color-text-primary;
}
.report-loading {
  margin-top: $mp-spacing-2;
}
.report-error {
  margin-top: $mp-spacing-2;
}
.error-text {
  color: $mp-color-error-dark;
  font-size: $mp-text-base;
}
.muted {
  color: $mp-color-text-muted;
  font-size: $mp-text-base;
}
.empty {
  display: flex;
  justify-content: center;
  padding: 96rpx 0;
}
</style>
```

- [ ] **Step 7: login/index.vue 换 token（padding 保留 32rpx）**

修改 `apps/miniapp-uni/src/pages/login/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-4; // login 单独保留 32rpx
}
</style>
```

注意：login 模板里 `<view class="content p-32">` 不动（保留 32rpx）。

- [ ] **Step 8: mine/index.vue 换 token**

修改 `apps/miniapp-uni/src/pages/mine/index.vue` 的 `<style lang="scss" scoped>` 整段，替换为：

```scss
<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-4; // mine 头部 user-card 保留 32rpx
}
.user-card {
  background: linear-gradient(
    135deg,
    $mp-color-primary 0%,
    $mp-color-primary-dark 100%
  );
  color: #fff;
}
.user-name {
  font-size: $mp-text-xl;
  font-weight: bold;
  color: #fff;
}
.user-email {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-base;
  color: rgba(255, 255, 255, 0.85);
}
.user-roles {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: rgba(255, 255, 255, 0.75);
}
.cell-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.block {
  display: block;
}
.popup-body {
  padding: $mp-spacing-4;
}
.popup-title {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.popup-actions {
  display: flex;
  gap: $mp-spacing-2;
  margin-top: $mp-spacing-4;
}
.popup-actions :deep(.u-button) {
  flex: 1;
}
</style>
```

注意：mine 模板里 `<view class="content p-24">` 不动（已是 24rpx）。

- [ ] **Step 9: 跑 vitest 确认无回归**

Run：
```bash
npx vitest run
```
Expected: 45 passed。

- [ ] **Step 10: 跑 build:h5 确认 8 页 SCSS 解析通过**

Run：
```bash
npm run build:h5
```
Expected: 成功，无 SCSS 变量未定义错误。dist 体积 1.4MB ± 50KB。

- [ ] **Step 11: Commit**

```bash
git add apps/miniapp-uni/src/pages
git commit -m "feat(miniapp-uni): E5 全量替换 8 页 hardcoded → SCSS variable"
```

---

## Task 6: E6 — 终验收 + tag + memory

**Files:**
- Create: `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_miniapp_uni_plan_e_complete.md`
- Modify: `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\MEMORY.md`（追加 1 行）

- [ ] **Step 1: 跑全量 vitest 收尾**

Run：
```bash
npx vitest run
```
Expected: 45 passed, 0 failed。如失败，先停止打 tag，回查上一 task 哪步引入回归。

- [ ] **Step 2: 跑 build:h5 收尾**

Run：
```bash
npm run build:h5
```
Expected: 成功。记录 dist 体积（应为 1.4MB ± 50KB）。

- [ ] **Step 3: H5 视觉走查（人工）**

打开 `apps/miniapp-uni/dist/build/h5/index.html` 于浏览器：

走查清单：
- [ ] 6 列表页（home / search / my-requests / approvals / notifications / report-summary）入页骨架 1 帧 → 真实卡片（home/report-summary 无骨架但要看 token 后视觉一致）
- [ ] 清 token 后 onShow → ErrorPlaceholder 显示，点 retry 可重发
- [ ] 空账号 → empty 占位文案统一显示「暂无数据」（除 approvals 仍可能有特定 fallback）
- [ ] 在 my-requests / approvals / notifications 下拉 → 触发刷新转圈
- [ ] 8 页 padding / color 视觉一致：除 login（32rpx 表单空间）和 mine 头部卡（32rpx），其余统一 24rpx

若任一项不通过，停在此步修正 — 不打 tag。

- [ ] **Step 4: 创建 empty commit + tag plan-e-complete**

Run：
```bash
git commit --allow-empty -m "chore(miniapp-uni): Plan E 完成 - vitest 45 / build:h5 持平 / tag plan-e-complete"
git tag plan-e-complete
git log --oneline -8
```
Expected: 看到 6 个 Plan E commit（E1-E5 + E6 empty）和 tag 已建。

- [ ] **Step 5: 写 memory project_miniapp_uni_plan_e_complete.md**

写入 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_miniapp_uni_plan_e_complete.md`：

```markdown
---
name: miniapp-uni Plan E 完成
description: miniapp-uni Plan E - 状态层 UI + 视觉一致性, vitest 45 (基线 43 + 新 2), build:h5 1.4MB, tag plan-e-complete
type: project
---
Plan E 总结（E1-E6, 6 commit）：

- **E1 tokens.scss**：新增 `src/styles/tokens.scss`（颜色/间距/圆角/字号，$mp- 前缀），uni.scss 引入
- **E2 useRefreshList**：LoadState 加 `'error'`、新增 `lastError`/`retry()`、`fetchListData` catch；单测 +2 用例（共 6）
- **E3 通用组件**：新增 `Skeleton`（u-skeleton 包装，count/rows/showTitle/showAvatar props）+ `ErrorPlaceholder`（message + retry emit）+ i18n `common.empty`
- **E4 4 列表页状态层**：search / my-requests（×2 tab） / approvals（自维护 reqsLoading/reqsError/purLoading/purError）/ notifications；后三页补 `onPullDownRefresh`
- **E5 全量 token 替换 8 页**：home/search/my-requests/approvals/notifications/report-summary/login/mine；统一 24rpx padding，login/mine 头部卡保留 32rpx
- **E6 终验**：vitest 45 / build:h5 持平 / 视觉走查通过 / empty commit + tag plan-e-complete

关键决策：
- **approvals 走自维护，不改 hook**：批次分组逻辑复杂，自维护 4 个 ref（reqsLoading/Error/purLoading/Error）比硬塞进 useRefreshList 更直观
- **login padding 单独保留 32rpx**：表单页需要更大空间感，不强行统一到 24rpx
- **tokens 用 $mp- 前缀**：避免与 $uni-* / uview $u-* 冲突，命名空间隔离
- **useRefreshList catch 不 rethrow**：api/request.ts 已 toast，hook 内吞错并设 error state，避免上层重复处理

下一步候选：Plan F（暗色模式 / 微交互装饰 / Playwright H5 E2E / 微信小程序真机联调）。当前 plan-e-complete，可基于该 tag 继续。
```

- [ ] **Step 6: 更新 MEMORY.md 索引**

读取 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\MEMORY.md`，找到 plan-d 那行：

```
- [miniapp-uni Plan D 完成](project_miniapp_uni_plan_d_complete.md) — 8 业务页迁移（含 fix DTO 错位+role 真实名+u-picker/tabs/action-sheet/popup）;vitest 43 build:h5 1.4MB;tag plan-d-complete @ 68b0aae
```

在该行下面追加一行（保持时间顺序）：

```
- [miniapp-uni Plan E 完成](project_miniapp_uni_plan_e_complete.md) — 状态层 UI（skeleton/error+retry/pull-down/empty 统一）+ tokens.scss 8 页全量换；vitest 45 build:h5 持平；tag plan-e-complete
```

- [ ] **Step 7: 验证 tag + git log 收尾**

Run：
```bash
git tag | grep plan-e
git log --oneline --tags -10
```
Expected: 看到 `plan-e-complete` 出现在 tag 列表；最近 10 条 log 含 6 个 Plan E commit。

---

## Self-Review 笔记

**1. Spec coverage 核对：**
- spec §3 tokens.scss → Task 1 ✓
- spec §4 useRefreshList 改造 + 单测 → Task 2 ✓
- spec §5 Skeleton/ErrorPlaceholder + i18n → Task 3 ✓
- spec §6 6 列表页落地差异（4 改状态层，2 仅 token）→ Task 4 + Task 5 ✓
- spec §7 6 commit 顺序 → Task 1-6 一一对应 ✓
- spec §8 验收 → Task 6 ✓

**2. Placeholder/contradictions 检查：**
- 无 TBD / TODO
- approvals 页 retry 调用 `refresh` 而非 `list.retry`（因 approvals 自维护、不走 hook），与 spec §6 一致
- search/notifications 模板 retry 调用 `list.retry`（来自 hook）— 与 Task 2 新增的 `retry()` 函数签名一致
- mine 的 `popup-body` 在 D 阶段已是 32rpx；Task 5 Step 8 内的 `.popup-body { padding: $mp-spacing-4; }` 保持原值，仅换 token

**3. Type/method 一致性：**
- `lastError: Ref<string | null>` 在 Task 2 hook 中定义，Task 4 各页用 `list.lastError.value || undefined` 传给 `ErrorPlaceholder` 的 `message` prop（接受 `string | undefined`），匹配
- `retry: () => Promise<void>` 在 Task 2 hook 中定义，Task 4 各页用 `@retry="list.retry"`（直接绑函数引用），匹配
- approvals 的 retry 绑 `refresh`（页面内函数），与 hook retry 解耦，OK
