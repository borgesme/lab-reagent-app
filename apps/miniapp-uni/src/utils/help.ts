// 获取环境变量配置
export function getMetaEnv(): ImportMetaEnv {
  return import.meta.env;
}

/**
 * 获取系统信息
 * @deprecated uni.getSystemInfoSync 已废弃，推荐改用 uni.getDeviceInfo / uni.getWindowInfo / uni.getAppBaseInfo
 */
export function getSystemInfo(): UniApp.GetSystemInfoResult {
  return uni.getSystemInfoSync();
}

type AnyFn = (...args: any[]) => any;

/**
 * 防抖函数
 * @param func 需要防抖的函数
 * @param wait 延迟时间（毫秒），默认 500
 * @param immediate 是否立即执行
 * @returns 防抖后的函数
 */
export function debounce<T extends AnyFn>(
  func: T,
  wait = 500,
  immediate = false,
): (this: unknown, ...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: unknown, ...args: Parameters<T>): void {
    const context = this;

    if (timeout) clearTimeout(timeout);

    if (immediate) {
      const callNow = !timeout;
      timeout = setTimeout(() => {
        timeout = null;
      }, wait);
      if (callNow && typeof func === 'function') {
        func.apply(context, args);
      }
    } else {
      timeout = setTimeout(() => {
        if (typeof func === 'function') {
          func.apply(context, args);
        }
      }, wait);
    }
  };
}

/**
 * 节流函数
 * @param func 需要节流的函数
 * @param wait 间隔时间（毫秒），默认 500
 * @returns 节流后的函数
 */
export function throttle<T extends AnyFn>(
  func: T,
  wait = 500,
): (this: unknown, ...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;

  return function (this: unknown, ...args: Parameters<T>): void {
    const context = this;
    const now = Date.now();
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      if (typeof func === 'function') {
        func.apply(context, args);
      }
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        if (typeof func === 'function') {
          func.apply(context, args);
        }
      }, remaining);
    }
  };
}

/**
 * 从 URL 中获取参数值
 * @param url 完整 URL 字符串
 * @param paramName 参数名
 * @returns 参数值（未匹配返回空字符串）
 */
export function getUrlParam(url: string, paramName: string): string {
  const reg = new RegExp(`${paramName}=([^&]+)`);
  const match = url.match(reg);
  return match ? match[1] : '';
}
