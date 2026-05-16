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
