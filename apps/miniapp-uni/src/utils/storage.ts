class Storage {
  get<T = unknown>(key: string): T | undefined {
    try {
      const data = uni.getStorageSync(key);
      return (data === '' ? undefined : (data as T));
    } catch (e) {
      console.error('[storage.get]', e);
      return undefined;
    }
  }

  set<T = unknown>(key: string, value: T): void {
    try {
      uni.setStorageSync(key, value);
    } catch (e) {
      console.error('[storage.set]', e);
    }
  }

  remove(key: string): void {
    try {
      uni.removeStorageSync(key);
    } catch (e) {
      console.error('[storage.remove]', e);
    }
  }

  has(name: string): boolean {
    try {
      const res = uni.getStorageInfoSync();
      return res.keys.includes(name);
    } catch (e) {
      console.error('[storage.has]', e);
      return false;
    }
  }

  clear(): void {
    try {
      uni.clearStorageSync();
    } catch (e) {
      console.error('[storage.clear]', e);
    }
  }
}

export default Storage;
