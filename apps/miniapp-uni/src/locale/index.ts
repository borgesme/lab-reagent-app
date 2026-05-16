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
    sys = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
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
  (i18n.global.locale as any).value = locale;
  try {
    uni.setStorageSync(STORAGE_KEY, locale);
  } catch {
    /* 小程序 storage 偶发失败，忽略 */
  }
}

export const t = i18n.global.t;
