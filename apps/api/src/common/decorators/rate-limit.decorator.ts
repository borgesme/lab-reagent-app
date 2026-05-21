export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSec: number;
  keyBy?: 'ip' | 'ip+body';
  bodyField?: string;
}

/**
 * 同一 handler（或 class）可叠加多个 @RateLimit()，全部 INCR，任一超限即 429。
 *
 * 直接用 Reflect.defineMetadata 把 opts 追加进数组，避免 SetMetadata
 * 多次调用覆盖前值。RateLimitGuard 端用 reflector.getAllAndMerge 聚合
 * handler + class 两层数组。
 */
export const RateLimit =
  (opts: RateLimitOptions): MethodDecorator & ClassDecorator =>
  (target: any, propertyKey?: any, descriptor?: any) => {
    const applyTo = descriptor?.value ?? target;
    const existing: RateLimitOptions[] =
      Reflect.getMetadata(RATE_LIMIT_KEY, applyTo) ?? [];
    Reflect.defineMetadata(RATE_LIMIT_KEY, [...existing, opts], applyTo);
  };
