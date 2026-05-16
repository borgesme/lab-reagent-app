import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import uviewPlus from '@/uni_modules/uview-plus';

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  app.use(uviewPlus);
  return { app };
}
