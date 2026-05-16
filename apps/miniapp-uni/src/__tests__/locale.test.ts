import { describe, it, expect, beforeEach } from 'vitest';
import { i18n, setLocale, detectLocale } from '@/locale';

describe('locale module', () => {
  beforeEach(() => {
    (i18n.global.locale as any).value = 'zh-CN';
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
    expect(detectLocale()).toBe('zh-CN');
  });
});
