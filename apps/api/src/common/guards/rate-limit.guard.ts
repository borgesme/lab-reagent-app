import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../redis/redis.service';
import { REDIS_KEYS } from '../redis/redis.constants';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private cfg: ConfigService,
    private logger: PinoLogger,
  ) {
    this.logger.setContext('RateLimit');
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.cfg.get('RATE_LIMIT_ENABLED') !== '1') return true;

    const opts = this.reflector.getAllAndMerge<RateLimitOptions[]>(
      RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!opts || opts.length === 0) return true;

    if (!this.redis.isReady()) {
      this.logger.warn(
        { component: 'rateLimit', reason: 'redis_down' },
        'redis down, rate-limit fail-open',
      );
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const ip = req.ip || 'unknown';

    for (const opt of opts) {
      const keyComponent = this.computeKey(opt, ip, req);
      const redisKey = REDIS_KEYS.rateLimit(opt.scope, keyComponent);
      const n = await this.redis.incr(redisKey);
      if (n === null) return true;
      if (n === 1) {
        await this.redis.expire(redisKey, opt.windowSec);
      }
      if (n > opt.limit) {
        const ttl = (await this.redis.ttl(redisKey)) ?? opt.windowSec;
        const retryAfter = ttl > 0 ? ttl : opt.windowSec;
        res.setHeader('Retry-After', String(retryAfter));
        throw new HttpException('too many requests', 429);
      }
    }
    return true;
  }

  private computeKey(
    opt: RateLimitOptions,
    ip: string,
    req: { body?: Record<string, unknown> },
  ): string {
    if (opt.keyBy === 'ip+body') {
      const field = opt.bodyField;
      if (!field) {
        this.logger.warn(
          { component: 'rateLimit', scope: opt.scope },
          'keyBy=ip+body but bodyField missing in decorator',
        );
        return `${ip}:__missing__`;
      }
      const raw = req.body?.[field];
      if (raw === undefined || raw === null || raw === '') {
        this.logger.warn(
          { component: 'rateLimit', scope: opt.scope, field },
          'body field missing in request',
        );
        return `${ip}:__missing__`;
      }
      return `${ip}:${String(raw)}`;
    }
    return ip;
  }
}
