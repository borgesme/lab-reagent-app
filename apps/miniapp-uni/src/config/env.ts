export const env = {
  appEnv: (import.meta.env.VITE_APP_ENV as string) ?? 'development',
  routerBase: (import.meta.env.VITE_ROUTER_BASE as string) ?? '/',
  baseUrl:
    (import.meta.env.VITE_BASE_URL as string) ??
    'http://localhost:3001/api/v1',
  get isDev() {
    return this.appEnv === 'development';
  },
  get isProd() {
    return this.appEnv === 'production';
  },
};
