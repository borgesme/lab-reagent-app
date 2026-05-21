export const REDIS_KEYS = {
  blacklist: (jti: string) => `bl:${jti}`,
  rateLimit: (scope: string, key: string) => `rl:${scope}:${key}`,
} as const;
