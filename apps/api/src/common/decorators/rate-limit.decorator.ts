import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSec: number;
  keyBy?: 'ip' | 'ip+body';
  bodyField?: string;
}

/**
 * 同一 handler 可叠加多个 @RateLimit()，全部 INCR，任一超限即 429。
 * 装饰器靠 Reflector.getAllAndMerge 聚合成数组（自动支持叠加）。
 */
export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
