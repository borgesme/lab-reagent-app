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
};
