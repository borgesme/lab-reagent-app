import { vi, beforeEach } from 'vitest';
import { createApp } from 'vue';
import { pinia } from './src/stores';

const storage = new Map<string, any>();

const mockUni = {
  request: vi.fn(),
  showToast: vi.fn(),
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
  showModal: vi.fn(),
  setStorageSync: vi.fn((k: string, v: any) => storage.set(k, v)),
  getStorageSync: vi.fn((k: string) => storage.get(k) ?? ''),
  removeStorageSync: vi.fn((k: string) => storage.delete(k)),
  reLaunch: vi.fn(),
  navigateTo: vi.fn(),
  switchTab: vi.fn(),
  navigateBack: vi.fn(),
  getSystemInfoSync: vi.fn(() => ({
    statusBarHeight: 20,
    language: 'zh-CN',
    platform: 'devtools',
    safeAreaInsets: { top: 20, bottom: 0, left: 0, right: 0 },
  })),
  stopPullDownRefresh: vi.fn(),
};

(globalThis as any).uni = mockUni;

// pinia plugins only register into `_p` after `app.use(pinia)`; vitest never
// runs createApp, so we install pinia into a throw-away app here so plugins
// (e.g. persistedstate) actually take effect for every test.
createApp({}).use(pinia);

beforeEach(() => {
  storage.clear();
  Object.values(mockUni).forEach((fn: any) => {
    if (typeof fn?.mockClear === 'function') fn.mockClear();
  });
});

