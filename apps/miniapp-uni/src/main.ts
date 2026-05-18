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
  // mp-weixin 下 globalProperties 不自动透传到模板，手动补挂 $t
  app.config.globalProperties.$t = i18n.global.t;
  return { app };
}
