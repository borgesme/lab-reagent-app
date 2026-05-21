import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private ready = false;
  private forcedDown = false;

  constructor(
    private readonly cfg: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('Redis');
  }

  onModuleInit() {
    const url = this.cfg.getOrThrow<string>('REDIS_URL');
    const keyPrefix = this.cfg.get<string>('REDIS_KEY_PREFIX') ?? '';
    this.client = new Redis(url, {
      keyPrefix,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: 500,
      lazyConnect: false,
    });
    this.client.on('ready', () => {
      this.ready = true;
      this.logger.info({ url: this.maskUrl(url) }, 'redis ready');
    });
    this.client.on('error', (err) => {
      this.logger.warn({ err: err.message }, 'redis error');
    });
    this.client.on('end', () => {
      this.ready = false;
      this.logger.warn('redis connection ended');
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* swallow */
      }
    }
  }

  isReady(): boolean {
    return this.ready && !this.forcedDown;
  }

  __disable(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__disable() is test-only');
    }
    this.forcedDown = true;
  }

  __enable(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__enable() is test-only');
    }
    this.forcedDown = false;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isReady()) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.warn('get', key, err);
      return null;
    }
  }

  async set(
    key: string,
    value: string,
    ttlSec?: number,
  ): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      if (ttlSec !== undefined) {
        await this.client.set(key, value, 'EX', ttlSec);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (err) {
      this.warn('set', key, err);
      return false;
    }
  }

  async incr(key: string): Promise<number | null> {
    if (!this.isReady()) return null;
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.warn('incr', key, err);
      return null;
    }
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      const n = await this.client.expire(key, ttlSec);
      return n === 1;
    } catch (err) {
      this.warn('expire', key, err);
      return false;
    }
  }

  async ttl(key: string): Promise<number | null> {
    if (!this.isReady()) return null;
    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.warn('ttl', key, err);
      return null;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isReady()) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      this.warn('del', key, err);
      return false;
    }
  }

  async __flushdb(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__flushdb() is test-only');
    }
    if (!this.isReady()) return;
    await this.client.flushdb();
  }

  async __ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const r = await this.client.ping();
      return r === 'PONG';
    } catch {
      return false;
    }
  }

  private warn(op: string, key: string, err: unknown): void {
    this.logger.warn(
      {
        component: 'redis',
        op,
        key,
        err: err instanceof Error ? err.message : String(err),
      },
      'redis op failed (fail-open)',
    );
  }

  private maskUrl(url: string): string {
    return url.replace(/:\/\/[^@]+@/, '://***@');
  }
}
