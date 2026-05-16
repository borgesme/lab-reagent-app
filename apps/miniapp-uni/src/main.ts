import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import uviewPlus from '@/uni_modules/uview-plus';

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { spike: { hello: '你好' } },
    en: { spike: { hello: 'Hello' } },
  },
});

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  app.use(uviewPlus);
  app.use(i18n);
  return { app };
}
