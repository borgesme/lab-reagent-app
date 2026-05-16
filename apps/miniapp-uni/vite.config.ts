import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: env.VITE_ROUTER_BASE || '/',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@app/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    plugins: [uni()],
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: [
            'legacy-js-api',
            'import',
            'global-builtin',
            'color-functions',
          ],
          quietDeps: true,
        },
      },
    },
    server: {
      port: 3003,
      open: true,
      hmr: true,
    },
  };
});
