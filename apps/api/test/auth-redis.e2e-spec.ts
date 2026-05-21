import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Auth + Redis (blacklist + rate-limit)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let redisOk = false;
  let originalRateLimit: string | undefined;

  beforeAll(async () => {
    originalRateLimit = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = '1';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const expressApp: any = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    redisOk = await Promise.race([
      redis.__ping(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ]);
    if (!redisOk) {
      // eslint-disable-next-line no-console
      console.warn(
        '[auth-redis.e2e] redis not reachable, skipping entire suite',
      );
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    process.env.RATE_LIMIT_ENABLED = originalRateLimit;
  });

  beforeEach(async () => {
    if (redisOk) {
      // ensure redis is enabled and clean between cases
      try {
        redis.__enable();
      } catch {
        /* not in test mode? ignore */
      }
      await redis.__flushdb();
    }
  });

  // Helper: in each it, early-return as pass when redis not reachable.
  function testIfRedis(name: string, fn: () => Promise<void>) {
    it(name, async () => {
      if (!redisOk) {
        // eslint-disable-next-line no-console
        console.warn(`[skip ${name}] redis not reachable`);
        return;
      }
      await fn();
    });
  }

  const adminCreds = { email: 'admin@lab.local', password: 'admin123' };

  async function loginAdmin() {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCreds);
    expectOk(res);
    return res.body.data as { accessToken: string; refreshToken: string };
  }

  testIfRedis(
    '1) logout 后旧 access 立即 401 token revoked',
    async () => {
      const tokens = await loginAdmin();
      const lo = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expectOk(lo);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expectBizError(me, 401, /revoked/i);
    },
  );

  testIfRedis(
    '2) logout 时 redis 不可用, fail-open (不真加黑名单)',
    async () => {
      const tokens = await loginAdmin();
      redis.__disable();
      const lo = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      // logout 应 fail-open 返回 ok
      expectOk(lo);
      redis.__enable();

      // 用同一 access 再 GET /auth/me, 因为没真写入黑名单,应继续 200
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expectOk(me);
    },
  );

  testIfRedis(
    '3) login 同 IP 11 次 -> 第 11 次 429 (ip 桶 limit=10)',
    async () => {
      // 用一个新的、不存在的 email,每次都触发 account 桶 +1 但 5 次以内不爆 account 桶
      // 为避免 account 桶先爆,每次换不同 email,这样 account 桶各 hit 1,IP 桶累计
      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: `ipbucket-${Date.now()}-${i}@lab.local`,
            password: 'whatever',
          });
        // 10 次以内不应是 429 (前 10 桶刚好填满)
        expect(res.body.code).not.toBe(429);
      }
      const over = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `ipbucket-${Date.now()}-11@lab.local`,
          password: 'whatever',
        });
      expectBizError(over, 429);
      const retryAfter = over.headers['retry-after'];
      expect(retryAfter).toBeDefined();
      const n = Number(retryAfter);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(60);
    },
  );

  testIfRedis(
    '4) login 同 email 6 次 -> 第 6 次 429 (account 桶 limit=5,先于 IP 桶满)',
    async () => {
      const email = `accountbucket-${Date.now()}@lab.local`;
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'wrong' });
        // 5 次以内不应被限流
        expect(res.body.code).not.toBe(429);
      }
      const sixth = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong' });
      expectBizError(sixth, 429);
    },
  );

  testIfRedis(
    '5) login 不同 email 同 IP 10 次, 第 10 次 200 (IP 桶刚满未超)',
    async () => {
      // 前 9 个不同的新 email + 错密 -> 各自 account 桶 hit 1, IP 桶累计 1..9
      for (let i = 0; i < 9; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: `bulk-${Date.now()}-${i}@lab.local`,
            password: 'wrong',
          });
        // 这些应是 401 (账号不存在/密码错), 绝不应是 429
        expect(res.body.code).not.toBe(429);
        expectBizError(res, 401);
      }
      // 第 10 次用合法 admin -> IP 桶刚好 10 还不超 (>limit 才超)
      const tenth = await request(app.getHttpServer())
        .post('/auth/login')
        .send(adminCreds);
      expectOk(tenth);
    },
  );

  testIfRedis(
    '6) GET /auth/me 无 @RateLimit, 任意频率 200',
    async () => {
      const tokens = await loginAdmin();
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${tokens.accessToken}`);
        expectOk(res);
      }
    },
  );

  testIfRedis(
    '7) access 被黑后 refresh 仍能换新 access (refresh 不受 access 黑名单影响)',
    async () => {
      const tokens = await loginAdmin();
      const access1 = tokens.accessToken;
      const refresh1 = tokens.refreshToken;

      const lo = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access1}`);
      expectOk(lo);

      const meBlocked = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${access1}`);
      expectBizError(meBlocked, 401);

      const rf = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: refresh1 });
      const rfData = expectOk(rf);
      expect(rfData.accessToken).toBeDefined();
      expect(rfData.refreshToken).toBeDefined();
      expect(rfData.accessToken).not.toBe(access1);

      const meNew = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${rfData.accessToken}`);
      expectOk(meNew);
    },
  );

  // touch prisma to silence "declared but never read" if needed
  it('prisma is wired (sanity)', () => {
    expect(prisma).toBeDefined();
  });
});
