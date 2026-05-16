import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia, defineStore } from 'pinia';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { AuthTokens, ApiResponse } from '@app/shared';

describe('Phase 0 S1: @app/shared 消费', () => {
  it('能 import AuthTokens 与 ApiResponse 类型', () => {
    const tokens: AuthTokens = { accessToken: 'a', refreshToken: 'b' };
    const res: ApiResponse<string> = { code: 200, msg: 'ok', data: 'x' };
    expect(tokens.accessToken).toBe('a');
    expect(res.code).toBe(200);
  });
});

describe('Phase 0 S2: vitest + pinia + vue3 reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('store getter/setter 工作', () => {
    const useCounter = defineStore('counter', () => {
      const n = ref(0);
      function inc() {
        n.value++;
      }
      return { n, inc };
    });
    const c = useCounter();
    expect(c.n).toBe(0);
    c.inc();
    c.inc();
    expect(c.n).toBe(2);
  });

  it('全局 mock uni 已注入', () => {
    expect((globalThis as any).uni).toBeDefined();
    expect(typeof (globalThis as any).uni.showToast).toBe('function');
  });
});

describe('Phase 0 S3: vue-i18n 兼容', () => {
  it('createI18n + t() 工作', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: {
        'zh-CN': { hello: '你好' },
        en: { hello: 'Hello' },
      },
    });
    expect(i18n.global.t('hello')).toBe('你好');
    (i18n.global.locale as any).value = 'en';
    expect(i18n.global.t('hello')).toBe('Hello');
  });
});
