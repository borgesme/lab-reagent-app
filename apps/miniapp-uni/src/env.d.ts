/// <reference types="vite/client" />

import type { ComposerTranslation } from 'vue-i18n';

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: ComposerTranslation;
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_ENV: string;
  readonly VITE_ROUTER_BASE: string;
  readonly VITE_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
