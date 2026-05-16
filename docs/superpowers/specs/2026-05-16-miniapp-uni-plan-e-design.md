# miniapp-uni Plan E — 状态层 UI + 视觉一致性

- **Date**: 2026-05-16
- **Project**: `apps/miniapp-uni`
- **Base tag**: `plan-d-complete @ 68b0aae`
- **Target tag**: `plan-e-complete`
- **Status**: design approved, pending implementation plan

## 1. 背景与目标

Plan A-D 已完成脚手架（A）、基建（B）、UI 骨架（C）、8 业务页迁移（D）。Plan D 的页面进入状态后表现为：

- 列表页进入时屏幕短暂空白（缺 loading 占位）
- 接口失败时 `request.ts` 弹 toast 后页面停留空白或保留旧数据（缺 error 占位 + retry）
- `pages.json` 已配 `enablePullDownRefresh: true` 的页面没有 `onPullDownRefresh` 处理函数（pull-down 转圈但不刷新）
- 8 页 hardcoded `#10b981` / `16rpx` / `24rpx` / `32rpx` 等数值，padding 在 home/mine/login（32rpx）与 my-requests/approvals/notifications/search（24rpx）之间不一致
- 各页 empty 用不同 i18n key（`toast.noResults` / `toast.noNotifications` / `myRequests.empty` / `approvals.emptyUse` / `approvals.emptyPurchase`）

Plan E 解决两件事：

1. **状态层 UI**：列表页统一的 loading 骨架 / error 占位 + retry / pull-down 刷新 / empty 一致化
2. **视觉一致性**：提取 SCSS token 集，全量替换 8 页 hardcoded 值

非范围：暗色模式（独立 Plan F）、微交互装饰（按钮 loading 动画、cell hover 等，不影响主流程）。

## 2. 架构 / 文件清单

### 新增

| 路径 | 用途 |
|---|---|
| `src/styles/tokens.scss` | 颜色 / 间距 / 圆角 / 字号 token，带 `$mp-` 前缀 |
| `src/components/skeleton/skeleton.vue` | 列表骨架，包一层 uview-plus 的 `u-skeleton`，按 count 渲染多张占位卡片 |
| `src/components/error-placeholder/error-placeholder.vue` | 错误占位 + retry 按钮 |

### 修改

| 路径 | 改动 |
|---|---|
| `src/hooks/useRefreshList.ts` | `LoadState` 加 `'error'`、新增 `lastError: Ref<string \| null>` 与 `retry()` 方法、`fetchListData` catch 后进 error 状态 |
| `src/__tests__/hooks-refresh-list.test.ts` | 增 2 用例：error path + retry |
| `src/uni.scss` | 顶部 `@import '@/styles/tokens.scss';` |
| `src/locale/zh-CN.ts` & `en.ts` | 新增 `common.empty` 统一 key |
| `src/pages/home/index.vue` | 仅视觉 token 替换（不用 useRefreshList） |
| `src/pages/search/index.vue` | 状态层模板 + token 替换 |
| `src/pages/my-requests/index.vue` | 状态层模板 ×2 tab + `onPullDownRefresh` + token 替换 |
| `src/pages/approvals/index.vue` | 自维护 `reqsLoading` / `reqsError` / `purLoading` / `purError` ref + Skeleton + ErrorPlaceholder + `onPullDownRefresh` + token 替换（hook 不动） |
| `src/pages/notifications/index.vue` | 状态层模板 + `onPullDownRefresh` + token 替换 |
| `src/pages/report-summary/index.vue` | 仅视觉 token 替换（现有 per-card loading/error/retry 保留） |
| `src/pages/login/index.vue` & `mine/index.vue` | 仅视觉 token 替换 |

### 不动

- `NavBar` / `TabBar` / `CustomBottomArea` 等组件（已稳定，靠 tokens 在 uni.scss 引入间接受益）
- `request.ts` / `auth store` / `api/modules/*` / `locale/index.ts`

## 3. tokens.scss 内容

```scss
// src/styles/tokens.scss

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
$mp-color-warn: #d97706;

// === 间距（rpx，8 倍数）===
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

`uni.scss` 在前两行 `@import` 之后追加：

```scss
@import '@/styles/tokens.scss';
```

**统一规则**：所有页面 content 内边距用 `$mp-spacing-3`(24rpx)，卡片 padding 也用 `$mp-spacing-3`，原 home/mine 的 32rpx 一并改为 24rpx。**login 单独保留 32rpx**（表单页空间感需要，不在列表流里）。

## 4. useRefreshList 改造

```ts
export type LoadState =
  | 'none' | 'loading' | 'empty' | 'ended'
  | 'error';     // 新增

export interface UseRefreshListReturn<T> {
  refreshing: Ref<RefreshState>;
  loading: Ref<LoadState>;
  pageNum: Ref<number>;
  totalRows: Ref<number>;
  dataList: Ref<T[]>;
  loadingFlag: Ref<boolean>;
  lastError: Ref<string | null>;    // 新增
  fetchListData: () => Promise<void>;
  fetchListRefresh: () => Promise<void>;
  fetchListLoad: () => Promise<void>;
  resetListData: () => void;
  retry: () => Promise<void>;        // 新增
}
```

`fetchListData` 加 catch：

```ts
async function fetchListData() {
  if (firstFlag.value) loadingFlag.value = true;
  lastError.value = null;
  try {
    const params = { ...getSearchParams(), pageNum: pageNum.value, pageSize };
    const resp = await requestAPI(params);
    // ...原 success 逻辑不动（records / total / loading 状态切换）
  } catch (e: any) {
    loading.value = 'error';
    lastError.value = e?.message ?? '加载失败';
    // 不 rethrow（request 层已 toast）
  } finally {
    loadingFlag.value = false;
    firstFlag.value = false;
    if (refreshing.value === 'refreshing') refreshing.value = 'none';
  }
}

async function retry() {
  pageNum.value = 1;
  totalRows.value = 0;
  firstFlag.value = true;
  loading.value = 'none';
  lastError.value = null;
  await fetchListData();
}
```

**向后兼容**：旧页面只判断 `loading === 'empty'`，新增 `'error'` 分支不会破坏现有行为。

**单测扩展**（`hooks-refresh-list.test.ts`）：

- 现有 4 用例保留
- 新增 2 用例：
  1. API reject → `loading.value === 'error'` && `lastError.value` 含 message
  2. retry() 后 `firstFlag` 复位、`loadingFlag` 再次 true、重新 fetch 成功后 loading 进 `'none' | 'empty' | 'ended'`

## 5. Skeleton / ErrorPlaceholder 组件

### Skeleton

```vue
<!-- src/components/skeleton/skeleton.vue -->
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
  count: 3, rows: 2, showTitle: true, showAvatar: false,
});
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.skeleton-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
  &:first-child { margin-top: 0; }
}
</style>
```

### ErrorPlaceholder

```vue
<!-- src/components/error-placeholder/error-placeholder.vue -->
<template>
  <view class="error-placeholder">
    <text class="error-icon">⚠</text>
    <text class="error-text block">
      {{ message || $t('toast.requestFailed') }}
    </text>
    <view class="mt-16">
      <u-button
        size="mini"
        :text="$t('common.retry')"
        @click="$emit('retry')"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props { message?: string }
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
.error-icon { font-size: $mp-text-2xl; color: $mp-color-error; }
.error-text { margin-top: $mp-spacing-2; font-size: $mp-text-base; color: $mp-color-text-tertiary; }
.block { display: block; }
</style>
```

### 页面状态分流模板

```vue
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
  <!-- 实际列表卡片 -->
</view>
```

### i18n 新增

`common.empty` = `'暂无数据'` / `'No data'`。旧 key（`toast.noResults` / `toast.noNotifications` / `myRequests.empty` / `approvals.emptyUse` / `approvals.emptyPurchase`）保留不动以备特定场景 fallback，但页面默认改用 `common.empty`。

## 6. 6 列表页落地差异

| 页面 | useRefreshList | onPullDownRefresh | Skeleton props | 备注 |
|---|---|---|---|---|
| `home` | 否 | 已 false | — | 未读 badge `try-catch` 内 fail-silent 不变 |
| `search` | 是 | 已 false | count 3, rows 2 | error 对接 retry |
| `my-requests` | 是 ×2 | 已 true → 补 | count 3, rows 2 | pull-down 调当前 tab 对应 fetchListRefresh |
| `approvals` | 否（自维护） | 已 true → 补 | count 3, rows 2 | 新增 reqsLoading/reqsError、purLoading/purError ref，refresh() 函数包 try-catch；retry 手写 |
| `notifications` | 是 | 已 true → 补 | count 3, rows 2 | 直接套模板 |
| `report-summary` | 否（per-card 已有 state） | 已 false | — | 仅视觉 token 替换 |

**approvals 自维护方案细节**：

```ts
const reqsLoading = ref(true);
const reqsError = ref<string | null>(null);
const purLoading = ref(true);
const purError = ref<string | null>(null);

async function refresh() {
  reqsLoading.value = true; reqsError.value = null;
  purLoading.value = true; purError.value = null;
  try {
    const [r, p] = await Promise.all([
      requestsApi.listPending(),
      purchasesApi.listPending(),
    ]);
    reqs.value = (r as ReqRow[]) ?? [];
    // ...batch grouping
  } catch (e: any) {
    reqsError.value = e?.message ?? '加载失败';
    purError.value = e?.message ?? '加载失败';
  } finally {
    reqsLoading.value = false;
    purLoading.value = false;
    uni.stopPullDownRefresh();
  }
}
```

页面模板按 tab 分别走 Skeleton / ErrorPlaceholder / 列表三态。

## 7. 6 commit 顺序

| Step | Commit | 范围 |
|---|---|---|
| E1 | `feat(miniapp-uni): E1 新增 tokens.scss + uni.scss 引入` | tokens.scss + uni.scss 引入 |
| E2 | `feat(miniapp-uni): E2 useRefreshList 加 error/lastError/retry + 单测 +2 用例（共 6）` | hook + 单测 |
| E3 | `feat(miniapp-uni): E3 新增 Skeleton + ErrorPlaceholder 通用组件` | 2 新组件 + i18n `common.empty` |
| E4 | `feat(miniapp-uni): E4 6 列表页装状态层 UI + 补 pull-down + 统一 empty` | search/my-requests/approvals/notifications + home/report-summary 局部 |
| E5 | `feat(miniapp-uni): E5 全量替换 8 页 hardcoded → SCSS variable` | 8 页 padding/radius/font/color 全换 token |
| E6 | `chore(miniapp-uni): Plan E 完成 - vitest ≥45 / build:h5 持平 / tag plan-e-complete` | empty commit + tag + memory |

## 8. 验收

- **每步**：`cd apps/miniapp-uni && npx vitest run` → pass 数不降（基线 43，E2 后 45+）
- **E6 终验**：
  - `npx vitest run` 45+ pass
  - `npm run build:h5` 成功 + dist 体积报告（预期 1.4MB ± 50KB；SCSS tokens 编译后内联不显著变大，Skeleton 包 u-skeleton 已通过 easycom 接入）
  - H5 视觉走查（`dist/build/h5/index.html` 在浏览器开）：
    - 6 列表页入页骨架 1 帧 → 真实卡片
    - 模拟 401（清 token 后 onShow）→ ErrorPlaceholder 显示 + retry 可点
    - 空账号 → empty 占位文案统一
    - 下拉 → 触发刷新转圈
    - 8 页 padding/color 视觉一致
  - 写 memory `project_miniapp_uni_plan_e_complete.md` + 更新 `MEMORY.md`
  - `git tag plan-e-complete`

## 9. 风险与回滚

- **token 替换波及面广**（8 页 ~50+ 个 hardcoded）：E5 单独 commit，bisect 友好；若视觉出问题可单独 revert E5 而 E1-E4 状态层 UI 保留
- **useRefreshList 改 LoadState 类型**：现有页面只判断 `'empty'`，新增 `'error'` 不破坏；若 hook 测试出问题可 revert E2 后页面回到旧吞错行为
- **approvals 自维护 vs 改 hook**：本 spec 选自维护（B），若实施时发现重复代码过多可中途切到 A，但要重做 batch 分组的 transform

## 10. 范围外

- 暗色模式（独立 Plan F）
- 微交互装饰（按钮 loading 动画、cell active 反馈、骨架动画细节调优）
- 微信小程序端打包验证 / 真机联调
- Playwright H5 E2E 接入
- NavBar/TabBar 等组件内部样式重构（仅靠 tokens 间接受益）
