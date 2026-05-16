# Plan B — miniapp-uni 基建：状态/i18n/网络

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 plan A 脚手架基础上接入完整 vue-i18n + pinia auth-store + api/request（含 tryRefresh 锁）+ 6 个业务 modules + `useBootTokenRefresh`，并让占位 home 页能调通 `auth.me()` 显示当前用户名。

**Architecture:** auth-store 用 Pinia setup-store；persist 用 `pinia-plugin-persistedstate` v4 + uni storage 适配器，按 spec §5.1 拆 `mp.tokens` / `mp.user` 双 key；request 用模块级 `refreshInflight` Promise 锁，body.code=401 → refresh + 重放，body.code=403 → clear + reLaunch login（与 web 端 `apps/web/src/lib/api-client.ts` 行为一致）。

**Tech Stack:** 沿用 plan A — pinia 3.x + pinia-plugin-persistedstate 4.x + vue-i18n 9.x + vitest 1.x。

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md) §3.4 / §4.6 / §5.1 / §5.2 / §5.3 / §5.4。

**前置:** Plan A 已完成（tag/commit 范围：从工程初始化到"docs(miniapp-uni): README + plan A 完成"）。Plan A 已写好 `config/env.ts` 与占位 vue-i18n（含 `spike.hello` key），本 plan **会替换** plan A 的临时 i18n。

**重要参考实现（直接抄过来改）:**
- `apps/web/src/lib/auth-store.ts` — hydrated 标志 + setSession/setTokens/setUser/clear 接口
- `apps/web/src/lib/api-client.ts` — `tryRefresh` + `refreshInflight` 锁 + `apiFetchRaw` 401 重试 + `apiFetch` 业务码解包
- `apps/web/src/lib/use-boot-token-refresh.ts` — ver claim 缺失检测（P0-3 行为，与 web 一致）
- `apps/miniapp/src/lib/auth-store.ts` / `apps/miniapp/src/lib/api-client.ts` — Taro 版的 storage key 命名 `mp.tokens` / `mp.user`

---

## File Structure

**本 plan 新增/修改文件（全部在 `apps/miniapp-uni/` 下）：**

```
apps/miniapp-uni/
├── src/
│   ├── locale/                       【新增】
│   │   ├── index.ts                  # createI18n + detectLocale + setLocale + i18n 单例
│   │   ├── zh-CN.ts                  # common/toast/tabBar/pageTitle 命名空间
│   │   └── en.ts                     # 同上英文
│   ├── stores/                       【新增】
│   │   ├── index.ts                  # createPinia + persistedState 插件
│   │   ├── persist.config.ts         # uni storage 适配器（spec §5.1）
│   │   └── auth.ts                   # setup-store: tokens / user / hydrated / setSession / setTokens / setUser / clear
│   ├── api/                          【新增】
│   │   ├── api-error.ts              # ApiError class
│   │   ├── request.ts                # apiRequest + tryRefresh + refreshInflight 锁
│   │   └── modules/
│   │       ├── auth.ts               # login / me / updateMe / changePassword
│   │       ├── reagents.ts           # list(q?)
│   │       ├── requests.ts           # listMine / listPending / create / cancel / decide
│   │       ├── purchases.ts          # listMine / listPending / create / cancel / decideBatch
│   │       ├── notifications.ts      # list / read / readAll
│   │       └── reports.ts            # usageTrend / inventoryTurnover / purchaseAmount
│   ├── hooks/                        【新增】
│   │   └── useBootTokenRefresh.ts    # onLaunch 调用一次；ver 缺失则 refresh
│   ├── utils/                        【新增】
│   │   └── jwt.ts                    # decodeJwtPayload（无依赖）
│   ├── main.ts                       【改】用 stores/index 替代 createPinia()；用 locale/ 替代占位 i18n
│   ├── App.vue                       【改】onLaunch 调 useBootTokenRefresh
│   └── pages/home/index.vue          【改】临时 login form + 显示用户名 + 退出登录（plan D 重写）
└── src/__tests__/                    【新增】
    ├── locale.test.ts                # 4 用例
    ├── stores-auth.test.ts           # 5 用例
    ├── utils-jwt.test.ts             # 3 用例（含 api-error）
    ├── api-request.test.ts           # 9 用例
    ├── api-modules.test.ts           # 6 用例
    └── use-boot-token-refresh.test.ts # 2 用例
```

**不动文件：** plan A 的 spike.test.ts / vitest.setup.ts / pages.json（5 tab 注册留 plan C） / mine/login 占位页。

---

## Task B1: vue-i18n 完整接入（替换 plan A 占位）

**Files:**
- Create: `apps/miniapp-uni/src/locale/index.ts`
- Create: `apps/miniapp-uni/src/locale/zh-CN.ts`
- Create: `apps/miniapp-uni/src/locale/en.ts`
- Create: `apps/miniapp-uni/src/__tests__/locale.test.ts`

- [ ] **Step B1.1: 写 `src/locale/zh-CN.ts`**

```ts
export default {
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
  },
  toast: {
    loading: '加载中...',
    requestFailed: '请求失败',
    networkError: '网络异常',
    sessionExpired: '会话已失效',
    success: '操作成功',
    loginFirst: '请先登录',
  },
  tabBar: {
    home: '工作台',
    myRequests: '申请',
    approvals: '审批',
    notifications: '消息',
    mine: '我的',
  },
  pageTitle: {
    home: '工作台',
    login: '登录',
    mine: '我的',
    search: '搜索试剂',
    myRequests: '我的申请',
    approvals: '待办审批',
    notifications: '消息',
    reportSummary: '报表概览',
  },
};
```

- [ ] **Step B1.2: 写 `src/locale/en.ts`**

```ts
export default {
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
  },
  toast: {
    loading: 'Loading...',
    requestFailed: 'Request failed',
    networkError: 'Network error',
    sessionExpired: 'Session expired',
    success: 'Success',
    loginFirst: 'Please log in first',
  },
  tabBar: {
    home: 'Home',
    myRequests: 'Requests',
    approvals: 'Approvals',
    notifications: 'Messages',
    mine: 'Mine',
  },
  pageTitle: {
    home: 'Home',
    login: 'Log in',
    mine: 'Mine',
    search: 'Search reagents',
    myRequests: 'My requests',
    approvals: 'Pending approvals',
    notifications: 'Messages',
    reportSummary: 'Reports',
  },
};
```

- [ ] **Step B1.3: 写 `src/locale/index.ts`**

```ts
import { createI18n } from 'vue-i18n';
import zhCN from './zh-CN';
import en from './en';

export type LocaleKey = 'zh-CN' | 'en';

const STORAGE_KEY = 'mp.locale';

export function detectLocale(): LocaleKey {
  try {
    const stored = uni.getStorageSync(STORAGE_KEY) as LocaleKey;
    if (stored === 'zh-CN' || stored === 'en') return stored;
  } catch {
    /* 首次启动无 storage */
  }
  let sys = '';
  try {
    sys = uni.getSystemInfoSync().language ?? '';
  } catch {
    sys =
      typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
  }
  if (sys.toLowerCase().startsWith('en')) return 'en';
  return 'zh-CN';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
});

export function setLocale(locale: LocaleKey) {
  i18n.global.locale.value = locale;
  try {
    uni.setStorageSync(STORAGE_KEY, locale);
  } catch {
    /* 小程序 storage 偶发失败，忽略 */
  }
}

export const t = i18n.global.t;
```

- [ ] **Step B1.4: 写 `src/__tests__/locale.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { i18n, setLocale, detectLocale } from '@/locale';

describe('locale module', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
  });

  it('zh-CN 词典命中常用 key', () => {
    expect(i18n.global.t('common.submit')).toBe('提交');
    expect(i18n.global.t('toast.networkError')).toBe('网络异常');
    expect(i18n.global.t('tabBar.home')).toBe('工作台');
  });

  it('切到 en 后词典随之切换', () => {
    setLocale('en');
    expect(i18n.global.t('common.submit')).toBe('Submit');
    expect(i18n.global.t('toast.networkError')).toBe('Network error');
  });

  it('setLocale 写入 storage（mp.locale）', () => {
    setLocale('en');
    expect(uni.getStorageSync('mp.locale')).toBe('en');
    setLocale('zh-CN');
    expect(uni.getStorageSync('mp.locale')).toBe('zh-CN');
  });

  it('detectLocale 优先 storage，回落系统语言', () => {
    uni.setStorageSync('mp.locale', 'en');
    expect(detectLocale()).toBe('en');
    uni.removeStorageSync('mp.locale');
    // vitest.setup.ts mock 中 language = 'zh-CN'
    expect(detectLocale()).toBe('zh-CN');
  });
});
```

- [ ] **Step B1.5: commit**

```bash
git add apps/miniapp-uni/src/locale apps/miniapp-uni/src/__tests__/locale.test.ts
git commit -m "feat(miniapp-uni): vue-i18n 完整接入（zh-CN + en + 检测/持久化）"
```

---

## Task B2: pinia 持久化适配器 + stores/index.ts

**Files:**
- Create: `apps/miniapp-uni/src/stores/persist.config.ts`
- Create: `apps/miniapp-uni/src/stores/index.ts`

- [ ] **Step B2.1: 写 `src/stores/persist.config.ts`**

```ts
import type { StorageLike } from 'pinia-plugin-persistedstate';

export const uniStorage: StorageLike = {
  getItem(key: string): string | null {
    try {
      const v = uni.getStorageSync(key);
      if (v === '' || v === undefined || v === null) return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      uni.setStorageSync(key, value);
    } catch {
      /* 小程序 storage 配额满会失败，忽略 */
    }
  },
  removeItem(key: string): void {
    try {
      uni.removeStorageSync(key);
    } catch {
      /* 忽略 */
    }
  },
};
```

- [ ] **Step B2.2: 写 `src/stores/index.ts`**

```ts
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';

export const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
```

- [ ] **Step B2.3: commit**

```bash
git add apps/miniapp-uni/src/stores/persist.config.ts apps/miniapp-uni/src/stores/index.ts
git commit -m "feat(miniapp-uni): pinia persistedstate + uni storage 适配器"
```

---

## Task B3: auth-store（setup-store）

**Files:**
- Create: `apps/miniapp-uni/src/stores/auth.ts`
- Create: `apps/miniapp-uni/src/__tests__/stores-auth.test.ts`

- [ ] **Step B3.1: 写 `src/stores/auth.ts`**

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AuthTokens, UserSummary } from '@app/shared';
import { uniStorage } from './persist.config';

export const useAuth = defineStore(
  'auth',
  () => {
    const tokens = ref<AuthTokens | null>(null);
    const user = ref<UserSummary | null>(null);
    const hydrated = ref(false);

    function setSession(t: AuthTokens, u: UserSummary) {
      tokens.value = t;
      user.value = u;
    }

    function setTokens(t: AuthTokens) {
      tokens.value = t;
    }

    function setUser(patch: Partial<UserSummary>) {
      if (!user.value) return;
      user.value = { ...user.value, ...patch };
    }

    function clear() {
      tokens.value = null;
      user.value = null;
    }

    return { tokens, user, hydrated, setSession, setTokens, setUser, clear };
  },
  {
    persist: [
      {
        key: 'mp.tokens',
        storage: uniStorage,
        pick: ['tokens'],
        afterHydrate: (ctx) => {
          (ctx.store as any).hydrated = true;
        },
      },
      {
        key: 'mp.user',
        storage: uniStorage,
        pick: ['user'],
      },
    ],
  },
);
```

注意：
- 拆 `mp.tokens` / `mp.user` 双 key（spec §5.1 与 Taro 版命名一致）
- pinia-plugin-persistedstate v4 序列化产物形如 `{"tokens":{"accessToken":"...","refreshToken":"..."}}`，**不是** Taro 端的裸值。bit-for-bit 灰度迁移需额外 serializer，超出本 plan 范围（在 plan E 决策）
- `afterHydrate` 在水合后翻转 `hydrated` 标志，供 `useBootTokenRefresh` 判断 ready

- [ ] **Step B3.2: 写 `src/__tests__/stores-auth.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import type { AuthTokens, UserSummary } from '@app/shared';

const tokens: AuthTokens = { accessToken: 'a1', refreshToken: 'r1' };
const user: UserSummary = {
  id: 'u1',
  email: 'admin@lab.local',
  name: 'Admin',
  roles: ['ADMIN'],
} as any;

describe('useAuth store', () => {
  beforeEach(() => {
    setActivePinia(pinia);
    const auth = useAuth();
    auth.clear();
  });

  it('setSession 写入 tokens + user', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    expect(auth.tokens).toEqual(tokens);
    expect(auth.user).toEqual(user);
  });

  it('setTokens 只更 tokens 不动 user', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.setTokens({ accessToken: 'a2', refreshToken: 'r2' });
    expect(auth.tokens?.accessToken).toBe('a2');
    expect(auth.user?.id).toBe('u1');
  });

  it('setUser 合并 patch', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.setUser({ name: 'Alice' });
    expect(auth.user?.name).toBe('Alice');
    expect(auth.user?.email).toBe('admin@lab.local');
  });

  it('clear 重置两个字段', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.clear();
    expect(auth.tokens).toBeNull();
    expect(auth.user).toBeNull();
  });

  it('persist 写入 mp.tokens / mp.user 两个 key', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    const stored = uni.getStorageSync('mp.tokens');
    const storedUser = uni.getStorageSync('mp.user');
    expect(stored).toContain('accessToken');
    expect(storedUser).toContain('admin@lab.local');
  });
});
```

- [ ] **Step B3.3: 运行测试 + commit**

```bash
pnpm --filter @app/miniapp-uni test
git add apps/miniapp-uni/src/stores/auth.ts apps/miniapp-uni/src/__tests__/stores-auth.test.ts
git commit -m "feat(miniapp-uni): auth-store setup-store + mp.tokens/mp.user 双 key 持久化"
```

---

## Task B4: api-error + jwt 工具

**Files:**
- Create: `apps/miniapp-uni/src/api/api-error.ts`
- Create: `apps/miniapp-uni/src/utils/jwt.ts`
- Create: `apps/miniapp-uni/src/__tests__/utils-jwt.test.ts`

- [ ] **Step B4.1: 写 `src/api/api-error.ts`**

```ts
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step B4.2: 写 `src/utils/jwt.ts`**

参考 `apps/web/src/lib/jwt.ts`，但用平台无关实现（不依赖 atob/Buffer）：

```ts
function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad !== 0) return '';
  if (typeof atob === 'function') return atob(s);
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('binary');
  return '';
}

export function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const raw = base64UrlDecode(payload);
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(raw))) as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step B4.3: 写 `src/__tests__/utils-jwt.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from '@/utils/jwt';
import { ApiError } from '@/api/api-error';

// header={"alg":"HS256","typ":"JWT"} payload={"sub":"u1","ver":3} 签名占位
const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInZlciI6M30.sig';
const LEGACY_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.sig';

describe('decodeJwtPayload', () => {
  it('正常 token 拿到 sub + ver', () => {
    const payload = decodeJwtPayload<{ sub: string; ver?: number }>(VALID_TOKEN);
    expect(payload?.sub).toBe('u1');
    expect(payload?.ver).toBe(3);
  });

  it('legacy token（缺 ver）拿到 sub，ver=undefined', () => {
    const payload = decodeJwtPayload<{ sub: string; ver?: number }>(LEGACY_TOKEN);
    expect(payload?.sub).toBe('u1');
    expect(payload?.ver).toBeUndefined();
  });

  it('非法 token 返回 null', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('ApiError', () => {
  it('携带 code + message', () => {
    const e = new ApiError(403, '会话已失效');
    expect(e.code).toBe(403);
    expect(e.message).toBe('会话已失效');
    expect(e.name).toBe('ApiError');
  });
});
```

- [ ] **Step B4.4: commit**

```bash
git add apps/miniapp-uni/src/api/api-error.ts apps/miniapp-uni/src/utils apps/miniapp-uni/src/__tests__/utils-jwt.test.ts
git commit -m "feat(miniapp-uni): ApiError + decodeJwtPayload 工具"
```

---

## Task B5: api/request.ts（apiRequest + tryRefresh + 401/403）

**Files:**
- Create: `apps/miniapp-uni/src/api/request.ts`
- Create: `apps/miniapp-uni/src/__tests__/api-request.test.ts`

- [ ] **Step B5.1: 写 `src/api/request.ts`**

```ts
import type { ApiResponse, AuthTokens } from '@app/shared';
import { env } from '@/config/env';
import { useAuth } from '@/stores/auth';
import { i18n } from '@/locale';
import { ApiError } from './api-error';

const t = (key: string) => i18n.global.t(key);

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOpts {
  method?: Method;
  data?: any;
  header?: Record<string, string>;
  /** 默认 30000ms */
  timeout?: number;
}

let refreshInflight: Promise<string | null> | null = null;

export async function tryRefresh(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refreshToken = useAuth().tokens?.refreshToken;
  if (!refreshToken) return null;
  refreshInflight = new Promise<string | null>((resolve) => {
    uni.request({
      url: `${env.baseUrl}/auth/refresh`,
      method: 'POST',
      data: { refreshToken },
      header: { 'Content-Type': 'application/json' },
      timeout: 30_000,
      success: (res) => {
        if (res.statusCode !== 200) return resolve(null);
        const body = res.data as ApiResponse<AuthTokens>;
        if (body?.code !== 200 || !body.data) return resolve(null);
        // 重要：如果期间已 clear（用户主动登出），不要把新 token 写回
        if (!useAuth().tokens) return resolve(null);
        useAuth().setTokens(body.data);
        resolve(body.data.accessToken);
      },
      fail: () => resolve(null),
    });
  }).finally(() => {
    refreshInflight = null;
  }) as Promise<string | null>;
  return refreshInflight;
}

function doRequest<T>(
  path: string,
  opts: ApiRequestOpts,
  accessToken: string | null,
): Promise<{ statusCode: number; body: ApiResponse<T> | null }> {
  return new Promise((resolve) => {
    uni.request({
      url: `${env.baseUrl}${path}`,
      method: opts.method ?? 'GET',
      data: opts.data,
      header: {
        'Content-Type': 'application/json',
        ...(opts.header ?? {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: opts.timeout ?? 30_000,
      success: (res) => {
        resolve({
          statusCode: res.statusCode,
          body: res.data as ApiResponse<T> | null,
        });
      },
      fail: () => {
        resolve({ statusCode: 0, body: null });
      },
    });
  });
}

export async function apiRequest<T = any>(
  path: string,
  opts: ApiRequestOpts = {},
): Promise<T> {
  const accessToken = useAuth().tokens?.accessToken ?? null;
  let res = await doRequest<T>(path, opts, accessToken);

  // 网络层错误
  if (res.statusCode === 0) {
    uni.showToast({ title: t('toast.networkError'), icon: 'none' });
    throw new ApiError(0, 'network error');
  }
  if (res.statusCode !== 200) {
    uni.showToast({ title: t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(res.statusCode, `HTTP ${res.statusCode}`);
  }

  let body = res.body;
  if (!body) {
    uni.showToast({ title: t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(-1, 'empty body');
  }

  // 业务层 401:尝试 refresh + 重放一次
  if (body.code === 401 && accessToken) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doRequest<T>(path, opts, newToken);
      body = res.body;
      if (res.statusCode === 200 && body?.code === 200) {
        return body.data as T;
      }
    }
    // refresh 失败或重放仍非 200:踢出
    useAuth().clear();
    uni.showToast({ title: t('toast.sessionExpired'), icon: 'none' });
    uni.reLaunch({ url: '/pages/login/index' });
    throw new ApiError(401, 'session expired');
  }

  if (body.code === 403) {
    useAuth().clear();
    uni.showToast({ title: t('toast.sessionExpired'), icon: 'none' });
    uni.reLaunch({ url: '/pages/login/index' });
    throw new ApiError(403, body.msg ?? 'forbidden');
  }

  if (body.code !== 200) {
    uni.showToast({ title: body.msg ?? t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(body.code, body.msg ?? 'business error');
  }

  return body.data as T;
}
```

- [ ] **Step B5.2: 写 `src/__tests__/api-request.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import { apiRequest, tryRefresh } from '@/api/request';
import { ApiError } from '@/api/api-error';

type Handler = (opts: any) => { statusCode: number; data: any } | 'fail';

function mockUniRequest(handlers: Handler[]) {
  let i = 0;
  (uni.request as any).mockImplementation((opts: any) => {
    const h = handlers[i] ?? handlers[handlers.length - 1];
    i++;
    const result = h(opts);
    if (result === 'fail') {
      opts.fail?.({ errMsg: 'fail' });
    } else {
      opts.success?.(result);
    }
  });
  return () => i;
}

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  (uni.request as any).mockReset();
});

describe('apiRequest 正常路径', () => {
  it('200 + code=200 解包 data', async () => {
    mockUniRequest([() => ({ statusCode: 200, data: { code: 200, msg: 'ok', data: { name: 'ok' } } })]);
    const r = await apiRequest<{ name: string }>('/x');
    expect(r.name).toBe('ok');
  });

  it('附带 Authorization header', async () => {
    useAuth().setSession({ accessToken: 'a1', refreshToken: 'r1' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    const seen: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      seen.push(opts.header);
      opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: 1 } });
    });
    await apiRequest('/me');
    expect(seen[0]['Authorization']).toBe('Bearer a1');
  });
});

describe('apiRequest 错误路径', () => {
  it('HTTP statusCode 非 200 toast + throw', async () => {
    mockUniRequest([() => ({ statusCode: 500, data: null })]);
    await expect(apiRequest('/x')).rejects.toBeInstanceOf(ApiError);
    expect(uni.showToast).toHaveBeenCalled();
  });

  it('network fail → ApiError(0)', async () => {
    mockUniRequest([() => 'fail']);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 0 });
  });

  it('业务 code 非 200/401/403 → toast body.msg + throw', async () => {
    mockUniRequest([() => ({ statusCode: 200, data: { code: 500, msg: '业务异常', data: null } })]);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 500 });
  });

  it('body.code=403 → clear + reLaunch login', async () => {
    useAuth().setSession({ accessToken: 'a', refreshToken: 'r' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    mockUniRequest([() => ({ statusCode: 200, data: { code: 403, msg: 'forbidden', data: null } })]);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 403 });
    expect(useAuth().tokens).toBeNull();
    expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });
});

describe('apiRequest 401 + tryRefresh', () => {
  it('body.code=401 → refresh 成功 → 用新 token 重放', async () => {
    useAuth().setSession({ accessToken: 'old', refreshToken: 'r1' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    const seen: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      seen.push(opts);
      if (seen.length === 1) {
        // 原始请求 → 401
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else if (seen.length === 2) {
        // refresh
        opts.success?.({
          statusCode: 200,
          data: { code: 200, msg: 'ok', data: { accessToken: 'new', refreshToken: 'r2' } },
        });
      } else {
        // 重放
        opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: { ok: true } } });
      }
    });
    const r = await apiRequest<{ ok: boolean }>('/me');
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(3);
    expect(useAuth().tokens?.accessToken).toBe('new');
    // 重放时 Authorization 是 new token
    expect(seen[2].header['Authorization']).toBe('Bearer new');
  });

  it('body.code=401 → refresh 失败 → clear + reLaunch login', async () => {
    useAuth().setSession({ accessToken: 'old', refreshToken: 'r1' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    let n = 0;
    (uni.request as any).mockImplementation((opts: any) => {
      n++;
      if (n === 1) {
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else {
        // refresh 也 401
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'refresh expired', data: null } });
      }
    });
    await expect(apiRequest('/me')).rejects.toMatchObject({ code: 401 });
    expect(useAuth().tokens).toBeNull();
    expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });

  it('并发 401:tryRefresh 只触发一次', async () => {
    useAuth().setSession({ accessToken: 'old', refreshToken: 'r1' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    const calls: string[] = [];
    let refreshCount = 0;
    (uni.request as any).mockImplementation((opts: any) => {
      calls.push(opts.url);
      if (opts.url.endsWith('/auth/refresh')) {
        refreshCount++;
        setTimeout(() => {
          opts.success?.({
            statusCode: 200,
            data: { code: 200, msg: 'ok', data: { accessToken: 'new', refreshToken: 'r2' } },
          });
        }, 5);
      } else if ((opts.header['Authorization'] as string).endsWith('old')) {
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else {
        opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: 'x' } });
      }
    });
    await Promise.all([apiRequest('/a'), apiRequest('/b')]);
    expect(refreshCount).toBe(1);
  });

  it('refresh 期间 store 被 clear → 不写回新 token', async () => {
    useAuth().setSession({ accessToken: 'old', refreshToken: 'r1' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    (uni.request as any).mockImplementation((opts: any) => {
      if (opts.url.endsWith('/auth/refresh')) {
        useAuth().clear();
        opts.success?.({
          statusCode: 200,
          data: { code: 200, msg: 'ok', data: { accessToken: 'new', refreshToken: 'r2' } },
        });
      }
    });
    const newToken = await tryRefresh();
    expect(newToken).toBeNull();
    expect(useAuth().tokens).toBeNull();
  });
});
```

- [ ] **Step B5.3: 运行测试 + commit**

```bash
pnpm --filter @app/miniapp-uni test
git add apps/miniapp-uni/src/api/request.ts apps/miniapp-uni/src/__tests__/api-request.test.ts
git commit -m "feat(miniapp-uni): apiRequest + tryRefresh（401 重放/403 踢出/并发锁）"
```

---

## Task B6: api/modules 6 个业务模块

**Files:**
- Create: `apps/miniapp-uni/src/api/modules/auth.ts`
- Create: `apps/miniapp-uni/src/api/modules/reagents.ts`
- Create: `apps/miniapp-uni/src/api/modules/requests.ts`
- Create: `apps/miniapp-uni/src/api/modules/purchases.ts`
- Create: `apps/miniapp-uni/src/api/modules/notifications.ts`
- Create: `apps/miniapp-uni/src/api/modules/reports.ts`
- Create: `apps/miniapp-uni/src/__tests__/api-modules.test.ts`

- [ ] **Step B6.1: 写 `src/api/modules/auth.ts`**

```ts
import type { AuthTokens, UserSummary } from '@app/shared';
import { apiRequest } from '../request';

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateMeDto {
  name?: string;
}

export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

export function login(dto: LoginDto) {
  return apiRequest<AuthTokens>('/auth/login', { method: 'POST', data: dto });
}

export function me() {
  return apiRequest<UserSummary>('/auth/me');
}

export function updateMe(dto: UpdateMeDto) {
  return apiRequest<UserSummary>('/auth/me', { method: 'PATCH', data: dto });
}

export function changePassword(dto: ChangePasswordDto) {
  return apiRequest<void>('/auth/change-password', { method: 'POST', data: dto });
}
```

- [ ] **Step B6.2: 写 `src/api/modules/reagents.ts`**

```ts
import { apiRequest } from '../request';

export function list(q?: string) {
  const path = q ? `/reagents?q=${encodeURIComponent(q)}` : '/reagents';
  return apiRequest<any[]>(path);
}
```

- [ ] **Step B6.3: 写 `src/api/modules/requests.ts`**

```ts
import { apiRequest } from '../request';

export interface CreateRequestDto {
  reagentId: string;
  amount: number;
  unit: string;
  reason?: string;
}

export interface DecideRequestDto {
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

export function listMine() {
  return apiRequest<any[]>('/requests');
}

export function listPending() {
  return apiRequest<any[]>('/requests?status=PENDING');
}

export function create(dto: CreateRequestDto) {
  return apiRequest<any>('/requests', { method: 'POST', data: dto });
}

export function cancel(id: string) {
  return apiRequest<void>(`/requests/${id}/cancel`, { method: 'POST' });
}

export function decide(id: string, dto: DecideRequestDto) {
  return apiRequest<any>(`/requests/${id}/approvals`, { method: 'POST', data: dto });
}
```

- [ ] **Step B6.4: 写 `src/api/modules/purchases.ts`**

```ts
import { apiRequest } from '../request';

export interface CreatePurchaseDto {
  reagentId: string;
  amount: number;
  unit: string;
  reason?: string;
}

export interface DecideBatchDto {
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

export function listMine() {
  return apiRequest<any[]>('/purchases/mine');
}

export function listPending() {
  return apiRequest<any[]>('/purchases');
}

export function create(dto: CreatePurchaseDto) {
  return apiRequest<any>('/purchases', { method: 'POST', data: dto });
}

export function cancel(id: string) {
  return apiRequest<void>(`/purchases/${id}/cancel`, { method: 'POST' });
}

export function decideBatch(batchId: string, dto: DecideBatchDto) {
  return apiRequest<any>(`/purchases/batches/${batchId}/approve`, {
    method: 'POST',
    data: dto,
  });
}
```

- [ ] **Step B6.5: 写 `src/api/modules/notifications.ts`**

```ts
import { apiRequest } from '../request';

export function list(unreadOnly?: boolean) {
  const path = unreadOnly ? '/notifications?unreadOnly=true' : '/notifications';
  return apiRequest<any[]>(path);
}

export function read(id: string) {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' });
}

export function readAll() {
  return apiRequest<void>('/notifications/read-all', { method: 'POST' });
}
```

- [ ] **Step B6.6: 写 `src/api/modules/reports.ts`**

```ts
import { apiRequest } from '../request';

export interface UsageTrendQuery {
  range?: string;
  summary?: 0 | 1;
}

export interface InventoryTurnoverQuery {
  range?: string;
  summary?: 0 | 1;
}

export interface PurchaseAmountQuery {
  range?: string;
  groupBy?: 'day' | 'week' | 'month';
  summary?: 0 | 1;
}

function qs(o: Record<string, any>) {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function usageTrend(query: UsageTrendQuery = {}) {
  return apiRequest<any>(`/reports/usage-trend${qs(query)}`);
}

export function inventoryTurnover(query: InventoryTurnoverQuery = {}) {
  return apiRequest<any>(`/reports/inventory-turnover${qs(query)}`);
}

export function purchaseAmount(query: PurchaseAmountQuery = {}) {
  return apiRequest<any>(`/reports/purchase-amount${qs(query)}`);
}
```

- [ ] **Step B6.7: 写 `src/__tests__/api-modules.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import * as authApi from '@/api/modules/auth';
import * as reagentsApi from '@/api/modules/reagents';
import * as requestsApi from '@/api/modules/requests';
import * as purchasesApi from '@/api/modules/purchases';
import * as notificationsApi from '@/api/modules/notifications';
import * as reportsApi from '@/api/modules/reports';

function captureRequest() {
  const calls: any[] = [];
  (uni.request as any).mockImplementation((opts: any) => {
    calls.push(opts);
    opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: null } });
  });
  return calls;
}

beforeEach(() => {
  setActivePinia(pinia);
  (uni.request as any).mockReset();
});

describe('api/modules path + method 契约', () => {
  it('auth.login POST /auth/login', async () => {
    const calls = captureRequest();
    await authApi.login({ email: 'a@b.c', password: 'x' });
    expect(calls[0].url).toMatch(/\/auth\/login$/);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].data).toEqual({ email: 'a@b.c', password: 'x' });
  });

  it('reagents.list GET /reagents?q=', async () => {
    const calls = captureRequest();
    await reagentsApi.list('h2o');
    expect(calls[0].url).toMatch(/\/reagents\?q=h2o$/);
    expect(calls[0].method).toBe('GET');
  });

  it('requests.decide POST /requests/:id/approvals', async () => {
    const calls = captureRequest();
    await requestsApi.decide('req-1', { decision: 'APPROVE' });
    expect(calls[0].url).toMatch(/\/requests\/req-1\/approvals$/);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].data.decision).toBe('APPROVE');
  });

  it('purchases.decideBatch POST /purchases/batches/:id/approve', async () => {
    const calls = captureRequest();
    await purchasesApi.decideBatch('b-1', { decision: 'REJECT', comment: '不行' });
    expect(calls[0].url).toMatch(/\/purchases\/batches\/b-1\/approve$/);
  });

  it('notifications.readAll POST /notifications/read-all', async () => {
    const calls = captureRequest();
    await notificationsApi.readAll();
    expect(calls[0].url).toMatch(/\/notifications\/read-all$/);
    expect(calls[0].method).toBe('POST');
  });

  it('reports.purchaseAmount 拼 query string', async () => {
    const calls = captureRequest();
    await reportsApi.purchaseAmount({ range: 'month', groupBy: 'month', summary: 1 });
    expect(calls[0].url).toMatch(/\/reports\/purchase-amount\?range=month&groupBy=month&summary=1$/);
  });
});
```

- [ ] **Step B6.8: commit**

```bash
git add apps/miniapp-uni/src/api/modules apps/miniapp-uni/src/__tests__/api-modules.test.ts
git commit -m "feat(miniapp-uni): api/modules 6 个业务模块（auth/reagents/requests/purchases/notifications/reports）"
```

---

## Task B7: useBootTokenRefresh hook

**Files:**
- Create: `apps/miniapp-uni/src/hooks/useBootTokenRefresh.ts`
- Create: `apps/miniapp-uni/src/__tests__/use-boot-token-refresh.test.ts`

- [ ] **Step B7.1: 写 `src/hooks/useBootTokenRefresh.ts`**

参考 `apps/web/src/lib/use-boot-token-refresh.ts`，移除 React `useEffect/useRef`，改为函数式（onLaunch 本身只触发一次）：

```ts
import { useAuth } from '@/stores/auth';
import { tryRefresh } from '@/api/request';
import { decodeJwtPayload } from '@/utils/jwt';

let ran = false;

/**
 * 在 App.vue onLaunch 中调用一次。
 *
 * 兼容 P0-3 legacy token:
 * 若水合后 access token 缺 `ver` claim(部署前签发的旧 token),
 * 立即调一次 /auth/refresh 换发带 ver 的新 token,
 * 避免后续请求 ver=undefined → 后端 401 风暴。
 *
 * 与 web 端 use-boot-token-refresh.ts 行为一致。
 */
export function useBootTokenRefresh() {
  if (ran) return;
  ran = true;
  const accessToken = useAuth().tokens?.accessToken;
  if (!accessToken) return;
  const payload = decodeJwtPayload<{ ver?: number }>(accessToken);
  if (payload && payload.ver === undefined) {
    tryRefresh().catch(() => {
      /* silent: 后续 API 401 会触发 clear + reLaunch */
    });
  }
}

/** 仅供测试重置内部 ran 标志 */
export function __resetBootGuard() {
  ran = false;
}
```

- [ ] **Step B7.2: 写 `src/__tests__/use-boot-token-refresh.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import {
  useBootTokenRefresh,
  __resetBootGuard,
} from '@/hooks/useBootTokenRefresh';

// header={alg:HS256,typ:JWT}.payload.sig
const LEGACY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.s';
const NEW = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInZlciI6M30.s';

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  __resetBootGuard();
  (uni.request as any).mockReset();
});

describe('useBootTokenRefresh', () => {
  it('legacy token(缺 ver) → 触发 /auth/refresh', async () => {
    useAuth().setSession({ accessToken: LEGACY, refreshToken: 'r' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    const calls: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      calls.push(opts.url);
      opts.success?.({
        statusCode: 200,
        data: { code: 200, msg: 'ok', data: { accessToken: NEW, refreshToken: 'r2' } },
      });
    });
    useBootTokenRefresh();
    // tryRefresh 内部 await uni.request, 让 microtask 排空
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((u) => u.endsWith('/auth/refresh'))).toBe(true);
  });

  it('新 token(含 ver) → 不触发 refresh', async () => {
    useAuth().setSession({ accessToken: NEW, refreshToken: 'r' }, { id: 'u', name: 'n', email: 'e', roles: [] } as any);
    const calls: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      calls.push(opts.url);
    });
    useBootTokenRefresh();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step B7.3: commit**

```bash
git add apps/miniapp-uni/src/hooks apps/miniapp-uni/src/__tests__/use-boot-token-refresh.test.ts
git commit -m "feat(miniapp-uni): useBootTokenRefresh hook（与 web P0-3 行为一致）"
```

---

## Task B8: 串起来 — main.ts / App.vue / home 占位页

**Files:**
- Modify: `apps/miniapp-uni/src/main.ts`
- Modify: `apps/miniapp-uni/src/App.vue`
- Modify: `apps/miniapp-uni/src/pages/home/index.vue`

- [ ] **Step B8.1: 改写 `src/main.ts`**

```ts
import { createSSRApp } from 'vue';
import App from './App.vue';
import uviewPlus from '@/uni_modules/uview-plus';
import { pinia } from '@/stores';
import { i18n } from '@/locale';

export function createApp() {
  const app = createSSRApp(App);
  app.use(pinia);
  app.use(uviewPlus);
  app.use(i18n);
  return { app };
}
```

注意：删除 plan A 在 main.ts 里临时定义的 `createI18n(... messages: { 'zh-CN': { spike: { hello: '你好' } } })`，改用从 `@/locale` 导入的单例。

- [ ] **Step B8.2: 改写 `src/App.vue`**

```vue
<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useBootTokenRefresh } from '@/hooks/useBootTokenRefresh';

onLaunch(() => {
  useBootTokenRefresh();
});

onShow(() => {});
onHide(() => {});
</script>

<style lang="scss">
@import '@/styles/index.scss';
</style>
```

- [ ] **Step B8.3: 改写 `src/pages/home/index.vue`**（plan A 占位 + plan B 调试面板）

```vue
<template>
  <view class="home p-32">
    <text class="title">{{ $t('pageTitle.home') }}</text>

    <view v-if="user" class="mt-32 card">
      <text class="text-primary">{{ user.name }}</text>
      <text class="text-muted mt-8 block">{{ user.email }}</text>
      <view class="mt-16">
        <u-button type="primary" :text="'调用 auth.me()'" @click="refreshMe" />
      </view>
      <view class="mt-16">
        <u-button :text="$t('common.logout')" @click="logout" />
      </view>
    </view>

    <view v-else class="mt-32 card">
      <u-form labelPosition="top">
        <u-form-item label="Email">
          <u-input v-model="form.email" placeholder="admin@lab.local" />
        </u-form-item>
        <u-form-item label="Password">
          <u-input v-model="form.password" type="password" placeholder="admin123" />
        </u-form-item>
      </u-form>
      <view class="mt-16">
        <u-button
          type="primary"
          :text="$t('common.login')"
          :loading="loading"
          @click="onLogin"
        />
      </view>
    </view>

    <view class="mt-32">
      <u-button :text="'switch locale (' + locale + ')'" @click="toggleLocale" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useAuth } from '@/stores/auth';
import { i18n, setLocale } from '@/locale';
import * as authApi from '@/api/modules/auth';

const auth = useAuth();
const user = computed(() => auth.user);

const form = reactive({ email: 'admin@lab.local', password: 'admin123' });
const loading = ref(false);

const locale = computed(() => i18n.global.locale.value);

async function onLogin() {
  loading.value = true;
  try {
    const tokens = await authApi.login(form);
    auth.setTokens(tokens);
    const u = await authApi.me();
    auth.setSession(tokens, u);
    uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
  } catch {
    /* api/request.ts 已 toast */
  } finally {
    loading.value = false;
  }
}

async function refreshMe() {
  try {
    const u = await authApi.me();
    auth.setUser(u);
  } catch {
    /* api/request.ts 已 toast */
  }
}

function logout() {
  auth.clear();
  uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
}

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN');
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
}
.title {
  font-size: 36rpx;
  font-weight: bold;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.block {
  display: block;
}
</style>
```

注意：
- 这只是 **plan B 验收用的临时调试面板**；plan D 会把 home 重写为正式工作台（带未读消息数、4 个快捷入口等），并把 login form 迁到 `pages/login`
- 删除 plan A 留下的 `_typeCheck` / `spike.hello` 引用（B1 已删 spike key，此处对齐）

- [ ] **Step B8.4: commit**

```bash
git add apps/miniapp-uni/src/main.ts apps/miniapp-uni/src/App.vue apps/miniapp-uni/src/pages/home/index.vue
git commit -m "feat(miniapp-uni): 整合 pinia/i18n/boot-refresh,home 占位页加临时登录调试"
```

---

## Task B9: 验收 + plan B 完成

无新代码，纯验证 + commit 标记。

- [ ] **Step B9.1: 跑 vitest 全量**

```bash
pnpm --filter @app/miniapp-uni test
```

预期：
- plan A 留下 4 用例（spike S1 + S2×2 + S3）
- plan B 新增 ≈29 用例（locale 4 + auth-store 5 + jwt 3 + request 9 + modules 6 + bootRefresh 2）
- **合计 ≈33 用例全过**，无失败

实际数字若与预期偏差 ±3 在可接受范围（INDEX 写的是"≈35"）。

- [ ] **Step B9.2: dev:h5 手工验证**

确保 `apps/api` dev server 在 `:3001` 已起：

```bash
# 终端 1
pnpm --filter @app/api start:dev
# 终端 2
pnpm --filter @app/miniapp-uni dev:h5
```

浏览器打开 `http://localhost:3003/#/pages/home/index`，验收：
1. 看到登录表单，预填 `admin@lab.local / admin123`
2. 点 "登录" → toast "操作成功"，表单消失，显示 "Admin" + email
3. 点 "调用 auth.me()" → 用户名/邮箱刷新（无报错）
4. 点 "switch locale (zh-CN)" → 按钮文字变 "Log out" / "Submit" 等
5. 点 "退出登录" → 回到登录表单，store 已清空
6. 刷新浏览器（保留 storage）→ 应仍处于登录态（pinia 水合）
7. 浏览器 devtools Application → Local Storage 可看到 `mp.tokens` 与 `mp.user` 两个 key

如果第 6 步未保持登录，检查：
- 浏览器 console 是否报 `uni is undefined`（plan A scaffold 应已注入）
- `mp.tokens` 是否写入（看 devtools）

- [ ] **Step B9.3: build:h5 验证生产可构建**

```bash
pnpm --filter @app/miniapp-uni build:h5
```

预期：成功，产物 `dist/build/h5/`。

- [ ] **Step B9.4: 写 plan B 完成 commit**

```bash
git status --short
# 预期：clean（或仅 dist/）
git commit --allow-empty -m "chore(miniapp-uni): plan B (基建) 完成"
```

- [ ] **Step B9.5: 更新 MEMORY.md（可选,与 P6/P7/P8 惯例一致）**

在 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\MEMORY.md` 加一行：

```
- [miniapp-uni plan B 完成](project_miniapp_uni_plan_b_status.md) — locale/stores/api/hooks 全过，vitest ≈33 全过；占位 home 已能登录显示用户名
```

并创建 `project_miniapp_uni_plan_b_status.md`：

```markdown
---
name: miniapp-uni plan B 完成
description: miniapp-uni 基建完成（i18n + pinia auth-store + api/request + 6 modules + useBootTokenRefresh）
type: project
---

完成 spec §3.4/§4.6/§5.1-§5.4。

**已落地：**
- locale: zh-CN + en + 自动检测 + mp.locale 持久化
- stores: auth-store setup-store + mp.tokens/mp.user 双 key 持久化
- api/request: apiRequest + tryRefresh + 401 自动重放 + 403 踢出 + 并发锁
- 6 modules: auth/reagents/requests/purchases/notifications/reports
- useBootTokenRefresh: P0-3 legacy token 兼容（与 web 一致）

**验收：**
- vitest ≈33 用例全过（plan A 4 spike + plan B 29 业务）
- dev:h5 → admin@lab.local/admin123 登录显示 "Admin" 验收通过

**遗留 TODO：**
- pinia persistedstate 序列化产物 `{"tokens":{...}}` 与 Taro 端 raw 写入不 bit-for-bit 兼容，灰度迁移留 plan E 决策
- mine 页"语言/Language"切换 UI 留 plan D（locale 模块本体已就绪）
- 5 tab 注册 + 自定义 NavBar/TabBar 留 plan C
```

完成后即可进入 [Plan C（UI 骨架）](./2026-05-14-miniapp-uni-c-ui-shell.md)。

---

## Plan B 验收标准

1. ✅ `pnpm --filter @app/miniapp-uni test` 全过，用例数 ≈33（plan A 4 + plan B 29，允许 ±3）
2. ✅ `pnpm --filter @app/miniapp-uni dev:h5` 起得来；admin@lab.local/admin123 登录显示用户名
3. ✅ 切换语言后 home 页按钮文字立即变化；刷新浏览器后语言偏好保留
4. ✅ 刷新浏览器后仍为登录态（pinia 水合 + mp.tokens/mp.user 两个 storage key 可见）
5. ✅ `pnpm --filter @app/miniapp-uni build:h5` 成功，产物 < 2.5 MB
6. ✅ 老 `apps/miniapp`（Taro）仍可 `pnpm --filter @app/miniapp dev:h5`，不受影响

---

## 与 spec 的偏离说明

| spec 原文 | plan B 实现 | 理由 |
|---|---|---|
| §5.1 "key 命名 mp.tokens / mp.user(便于灰度时复用 storage)" | persistedstate v4 双 key,但序列化产物是 `{tokens:{...}}` wrapper,与 Taro raw 写入不 bit-for-bit 兼容 | 严格 bit-for-bit 需自定义 serializer,工程复杂度收益失衡;灰度策略留 plan E 统一决策 |
| §5.4 hooks(useLoginCheck / useRefreshList / useWxCapsuleRect) | 本 plan 只实现 useBootTokenRefresh | 其余 hooks 与 UI 骨架(NavBar/列表)耦合,留 plan C |
| §4.6 mine 页"语言/Language"切换 cell | locale 模块本体完整(detect/set/storage),mine 页 UI 留 plan D | mine 页完整改造在 plan D,本 plan 不动占位 |
