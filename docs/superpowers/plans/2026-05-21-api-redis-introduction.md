# apps/api 引入 Redis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/api` 引入 Redis 基础设施层，落地 access token jti 黑名单 + 通用 `@RateLimit()` 装饰器，第一刀只覆盖 `/auth/login` 限流和 logout 即时撤销，refresh token 维持现状。

**Architecture:** 新建全局 `RedisModule`（手写 ioredis 封装，fail-open + warn 日志），新增前置全局 `RateLimitGuard`（仅对带装饰器的 handler 起作用），扩展现有 `JwtAuthGuard` 加一步黑名单查询，AuthService 给 access 也签 jti、新增 logout 方法写黑名单。所有用例靠 e2e 覆盖（沿用 apps/api 不写 unit 的约定）。

**Tech Stack:** NestJS 10, ioredis 5, jest e2e, pino。

**Spec:** `docs/superpowers/specs/2026-05-21-api-redis-introduction-design.md`

---

## 文件结构

### 新增

- `apps/api/src/common/redis/redis.constants.ts` — KEY 生成函数
- `apps/api/src/common/redis/redis.service.ts` — 包 ioredis，fail-open + 测试钩子
- `apps/api/src/common/redis/redis.module.ts` — `@Global()`
- `apps/api/src/common/decorators/rate-limit.decorator.ts` — `@RateLimit(opts)`
- `apps/api/src/common/guards/rate-limit.guard.ts` — 全局守卫
- `apps/api/test/auth-redis.e2e-spec.ts` — 唯一新 e2e 文件

### 修改

- `apps/api/package.json` — 增 ioredis 依赖
- `apps/api/.env.example` — 增 3 个变量
- `apps/api/src/main.ts` — 启用 trust proxy
- `apps/api/src/app.module.ts` — imports + APP_GUARD
- `apps/api/src/modules/auth/auth.service.ts` — issueTokens 加 jti、新增 logout
- `apps/api/src/modules/auth/auth.controller.ts` — 新增 logout endpoint + 两处 @RateLimit
- `apps/api/src/common/strategies/jwt.strategy.ts` — validate 返回 jti/exp
- `apps/api/src/common/guards/jwt.guard.ts` — 黑名单查询
- `apps/api/src/health/health.controller.ts` — 暴露 redis 状态

---

## Task 1：添加 ioredis 依赖

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: 安装 ioredis**

```bash
pnpm --filter @app/api add ioredis@5.10.1
```

- [ ] **Step 2: 校验 lockfile + 节点版本**

```bash
pnpm --filter @app/api list ioredis
```

Expected: 输出包含 `ioredis 5.10.1`

- [ ] **Step 3: 提交**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add ioredis 5.10.1 dependency"
```

---

## Task 2：补 env 变量

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: 增 3 个变量**

`apps/api/.env.example` 在 `REDIS_URL` 那行下面追加：

```
REDIS_KEY_PREFIX=lab:
REDIS_FAIL_OPEN=1
RATE_LIMIT_ENABLED=1
```

完整效果：

```
DATABASE_URL=postgresql://lab:lab@localhost:5432/lab_reagent
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=lab:
REDIS_FAIL_OPEN=1
RATE_LIMIT_ENABLED=1
JWT_ACCESS_SECRET=change_me_access
...（其余保持不变）
```

- [ ] **Step 2: 同步开发本机 `.env`**

如果存在 `apps/api/.env`（未入库），手动追加这 3 行。**这一步不能用 git 验证，只做提醒**。

- [ ] **Step 3: 提交**

```bash
git add apps/api/.env.example
git commit -m "chore(api): env 增 REDIS_KEY_PREFIX/REDIS_FAIL_OPEN/RATE_LIMIT_ENABLED"
```

---

## Task 3：RedisService + RedisModule

**Files:**
- Create: `apps/api/src/common/redis/redis.constants.ts`
- Create: `apps/api/src/common/redis/redis.service.ts`
- Create: `apps/api/src/common/redis/redis.module.ts`

- [ ] **Step 1: 创建 constants**

`apps/api/src/common/redis/redis.constants.ts`：

```ts
export const REDIS_KEYS = {
  blacklist: (jti: string) => `bl:${jti}`,
  rateLimit: (scope: string, key: string) => `rl:${scope}:${key}`,
} as const;
```

- [ ] **Step 2: 创建 RedisService**

`apps/api/src/common/redis/redis.service.ts`：

```ts
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

  /** 仅测试用：模拟 redis 挂掉，让 isReady() 返回 false */
  __disable(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__disable() is test-only');
    }
    this.forcedDown = true;
  }

  /** 仅测试用 */
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

  /** 测试 helper：清当前 db。仅 test 可用 */
  async __flushdb(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__flushdb() is test-only');
    }
    if (!this.isReady()) return;
    await this.client.flushdb();
  }

  /** 测试 helper：直接 ping */
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
```

- [ ] **Step 3: 创建 RedisModule**

`apps/api/src/common/redis/redis.module.ts`：

```ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 4: 在 AppModule 挂上**

`apps/api/src/app.module.ts` 顶部 import 新增：

```ts
import { RedisModule } from './common/redis/redis.module';
```

imports 数组在 `LogsModule` 后追加 `RedisModule`：

```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  LogsModule,
  RedisModule,
  ScheduleModule.forRoot(),
  PrismaModule,
  ...
],
```

- [ ] **Step 5: 验证 build**

Run: `pnpm --filter @app/api build`
Expected: 退出码 0，无新增 ts 错误。

- [ ] **Step 6: 启动 redis 并冒烟**

```bash
docker compose up -d redis
pnpm --filter @app/api start:dev
```

Expected：日志里看到 `redis ready` 一行（pino 输出含 `url` 字段）。然后 `Ctrl+C` 停掉。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/common/redis apps/api/src/app.module.ts
git commit -m "feat(api): 引入 RedisModule + RedisService (ioredis, fail-open)"
```

---

## Task 4：扩展 JwtStrategy 返回 jti/exp

**Files:**
- Modify: `apps/api/src/common/strategies/jwt.strategy.ts`

- [ ] **Step 1: validate 签名与返回值扩展**

把现有内容整体替换为：

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private cfg: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }
  async validate(payload: {
    sub: string;
    roles: string[];
    ver?: number;
    jti?: string;
    exp?: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const allowLegacy = this.cfg.get('JWT_ALLOW_LEGACY_CLAIMS') === '1';
    if (payload.ver === undefined) {
      if (!allowLegacy) throw new UnauthorizedException();
    } else if (payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return {
      sub: payload.sub,
      roles: payload.roles,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
```

- [ ] **Step 2: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/common/strategies/jwt.strategy.ts
git commit -m "feat(api): JwtStrategy.validate 返回 jti/exp 供 logout/黑名单使用"
```

---

## Task 5：AuthService 给 access 签 jti + logout 写黑名单

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: 注入 RedisService + 改 issueTokens + 加 logout**

把现有 `auth.service.ts` 整体替换为：

```ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { REDIS_KEYS } from '../../common/redis/redis.constants';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const plainRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'PLAIN_USER' },
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: { create: [{ roleId: plainRole.id }] },
      },
    });
    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(user.id, roles, user.tokenVersion);
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      labId: u.labId,
      roles: u.roles.map((ur) => ur.role.code),
    };
  }

  async updateMe(userId: string, dto: { name: string }) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
    });
    return this.me(userId);
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(userId, roles, updated.tokenVersion);
  }

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.deletedAt) throw new UnauthorizedException();
      const allowLegacy = this.cfg.get('JWT_ALLOW_LEGACY_CLAIMS') === '1';
      const isLegacy =
        payload.jti === undefined && payload.ver === undefined;
      if (isLegacy) {
        if (!allowLegacy) throw new UnauthorizedException();
      } else {
        if (!payload.jti || user.currentRefreshJti !== payload.jti) {
          throw new UnauthorizedException();
        }
        if (payload.ver !== user.tokenVersion) {
          throw new UnauthorizedException();
        }
      }
      return this.issueTokens(payload.sub, payload.roles, user.tokenVersion);
    } catch {
      throw new UnauthorizedException();
    }
  }

  async logout(jti: string | undefined, exp: number | undefined): Promise<{ ok: true }> {
    if (!jti || !exp) return { ok: true };
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return { ok: true };
    await this.redis.set(REDIS_KEYS.blacklist(jti), '1', ttl);
    return { ok: true };
  }

  private async issueTokens(sub: string, roles: string[], ver: number) {
    const accessJti = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub, roles, ver, jti: accessJti },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshJti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub, roles, jti: refreshJti, ver },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    await this.prisma.user.update({
      where: { id: sub },
      data: { currentRefreshJti: refreshJti },
    });
    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 2: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 3: 跑原有 auth e2e 防回归**

```bash
pnpm --filter @app/api test:e2e -- --testPathPattern=auth.e2e
```

Expected：原有 auth 全部 pass（access 签了 jti 不影响现有 spec）。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(api): access 签 jti + 新增 logout 写 redis 黑名单 (fail-open)"
```

---

## Task 6：JwtAuthGuard 加黑名单查询

**Files:**
- Modify: `apps/api/src/common/guards/jwt.guard.ts`

- [ ] **Step 1: 改写 guard**

整体替换为：

```ts
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { REDIS_KEYS } from '../redis/redis.constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private cfg: ConfigService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const ok = (await super.canActivate(ctx)) as boolean;
    if (!ok) return false;

    const req = ctx.switchToHttp().getRequest();
    const jti: string | undefined = req.user?.jti;
    if (!jti) {
      const allowLegacy = this.cfg.get('JWT_ALLOW_LEGACY_CLAIMS') === '1';
      if (!allowLegacy) throw new UnauthorizedException();
      return true;
    }
    const hit = await this.redis.get(REDIS_KEYS.blacklist(jti));
    if (hit === '1') {
      throw new UnauthorizedException('token revoked');
    }
    return true;
  }
}
```

- [ ] **Step 2: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 3: 跑现有 e2e 防回归**

```bash
pnpm --filter @app/api test:e2e
```

Expected：现有用例全过（黑名单永远未命中 → 行为等价）。如果有 redis 没起，先 `docker compose up -d redis`。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/common/guards/jwt.guard.ts
git commit -m "feat(api): JwtAuthGuard 加 access jti 黑名单查询 (fail-open)"
```

---

## Task 7：AuthController 加 logout endpoint

**Files:**
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: 在 controller 顶部 import + 新增 logout**

把整个文件替换为：

```ts
import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '注册新用户' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '邮箱密码登录, 返回 access/refresh token' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '用 refresh token 换新的 access/refresh token' })
  refresh(@Body('refreshToken') token: string) {
    return this.auth.refresh(token);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出, 把当前 access token jti 加黑名单' })
  logout(@Req() req: any) {
    return this.auth.logout(req.user?.jti, req.user?.exp);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户资料' })
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Audit({ action: 'USER_UPDATE_SELF', entityType: 'User' })
  @ApiOperation({ summary: '更新当前用户资料 (姓名)' })
  updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(req.user.sub, dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(200)
  @Audit({ action: 'USER_CHANGE_PASSWORD', entityType: 'User' })
  @ApiOperation({ summary: '修改密码, tokenVersion++ 踢其他会话' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto);
  }
}
```

- [ ] **Step 2: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(api): auth controller 新增 POST /auth/logout"
```

---

## Task 8：@RateLimit 装饰器

**Files:**
- Create: `apps/api/src/common/decorators/rate-limit.decorator.ts`

- [ ] **Step 1: 写装饰器**

```ts
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
```

- [ ] **Step 2: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/common/decorators/rate-limit.decorator.ts
git commit -m "feat(api): 新增 @RateLimit 装饰器"
```

---

## Task 9：RateLimitGuard

**Files:**
- Create: `apps/api/src/common/guards/rate-limit.guard.ts`

- [ ] **Step 1: 写守卫**

```ts
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

    const merged = this.reflector.getAllAndMerge<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    // getAllAndMerge 对单个对象会返回单对象而非数组，统一成数组
    const opts: RateLimitOptions[] = Array.isArray(merged)
      ? merged
      : merged
      ? [merged]
      : [];
    if (opts.length === 0) return true;

    if (!this.redis.isReady()) {
      this.logger.warn(
        { component: 'rateLimit', reason: 'redis_down' },
        'redis down, rate-limit fail-open',
      );
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const ip = (req.ip || 'unknown') as string;

    for (const opt of opts) {
      const keyComponent = this.computeKey(opt, ip, req);
      const redisKey = REDIS_KEYS.rateLimit(opt.scope, keyComponent);
      const n = await this.redis.incr(redisKey);
      if (n === null) continue; // fail-open
      if (n === 1) {
        await this.redis.expire(redisKey, opt.windowSec);
      }
      if (n > opt.limit) {
        const ttl = (await this.redis.ttl(redisKey)) ?? opt.windowSec;
        const retryAfter = ttl > 0 ? ttl : opt.windowSec;
        res.setHeader?.('Retry-After', String(retryAfter));
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
```

- [ ] **Step 2: 在 AppModule 注册为全局守卫 (放在 APP_GUARD 首位)**

`apps/api/src/app.module.ts` 顶部 import：

```ts
import { RateLimitGuard } from './common/guards/rate-limit.guard';
```

providers 数组内 `APP_GUARD` 顺序调整为：

```ts
providers: [
  JwtStrategy,
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
  { provide: APP_GUARD, useClass: RateLimitGuard },   // ← 首位，先于 JwtAuthGuard
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
],
```

- [ ] **Step 3: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 4: 全 e2e 防回归**

确保 redis 起着：`docker compose up -d redis`

```bash
pnpm --filter @app/api test:e2e
```

Expected：原有所有 e2e 全过（没接口加 @RateLimit，guard 全部 return true）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/common/guards/rate-limit.guard.ts apps/api/src/app.module.ts
git commit -m "feat(api): RateLimitGuard 全局生效, 仅装饰过的 handler 起作用"
```

---

## Task 10：登录 / 登出贴限流装饰器 + trust proxy

**Files:**
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: main.ts 启用 trust proxy**

`apps/api/src/main.ts` 在 `app.enableCors(...)` 那行下面追加：

```ts
const expressApp = app.getHttpAdapter().getInstance();
expressApp.set('trust proxy', 1);
```

完整片段示意：

```ts
app.enableCors({ origin: true, credentials: true });
const expressApp = app.getHttpAdapter().getInstance();
expressApp.set('trust proxy', 1);
```

- [ ] **Step 2: controller import 装饰器**

`apps/api/src/modules/auth/auth.controller.ts` 顶部 import 新增：

```ts
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
```

- [ ] **Step 3: 给 login 叠两个 @RateLimit**

`login` handler 装饰器（在 `@Public()` 之后、`@Post('login')` 之前）追加：

```ts
@Public()
@RateLimit({ scope: 'auth:login:ip', limit: 10, windowSec: 60 })
@RateLimit({ scope: 'auth:login:account', limit: 5, windowSec: 60, keyBy: 'ip+body', bodyField: 'email' })
@Post('login')
@HttpCode(200)
@ApiOperation({ summary: '邮箱密码登录, 返回 access/refresh token' })
login(@Body() dto: LoginDto) {
  return this.auth.login(dto);
}
```

- [ ] **Step 4: 给 logout 加 @RateLimit**

```ts
@Post('logout')
@RateLimit({ scope: 'auth:logout:ip', limit: 30, windowSec: 60 })
@HttpCode(200)
@ApiBearerAuth()
@ApiOperation({ summary: '登出, 把当前 access token jti 加黑名单' })
logout(@Req() req: any) {
  return this.auth.logout(req.user?.jti, req.user?.exp);
}
```

- [ ] **Step 5: build 校验**

Run: `pnpm --filter @app/api build`
Expected：0 错误。

- [ ] **Step 6: 跑现有 e2e**

```bash
pnpm --filter @app/api test:e2e -- --testPathPattern=auth.e2e
```

Expected：原 auth e2e 全过；login 在测试里调用次数远低于 limit，限流不会触发。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/main.ts apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(api): trust proxy + login/logout 贴 @RateLimit"
```

---

## Task 11：health endpoint 暴露 redis 状态

**Files:**
- Modify: `apps/api/src/health/health.controller.ts`

- [ ] **Step 1: 注入 RedisService**

把现有文件整体替换为：

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { RedisService } from '../common/redis/redis.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  @ApiOperation({ summary: '健康检查' })
  check() {
    return {
      status: 'ok',
      redis: this.redis.isReady() ? 'up' : 'down',
    };
  }
}
```

- [ ] **Step 2: 改 health.e2e 期望**

`apps/api/test/health.e2e-spec.ts` 当前断言可能只检查 `status:'ok'`。先看一眼：

```bash
cat apps/api/test/health.e2e-spec.ts
```

如果断言里有 `toEqual({status:'ok'})` 这种**严格相等**，改为 `toMatchObject({ status: 'ok' })`，让新增的 `redis` 字段不破坏。如果断言是 `expect(data.status).toBe('ok')` 这种字段级，无需改。

- [ ] **Step 3: 跑 health e2e**

```bash
pnpm --filter @app/api test:e2e -- --testPathPattern=health.e2e
```

Expected：pass。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/health/health.controller.ts apps/api/test/health.e2e-spec.ts
git commit -m "feat(api): /health 暴露 redis 状态"
```

如果 health e2e 文件没改动，git add 列表去掉它。

---

## Task 12：新增 auth-redis.e2e-spec.ts

**Files:**
- Create: `apps/api/test/auth-redis.e2e-spec.ts`

- [ ] **Step 1: 编写 e2e（含 redis 不通自跳过）**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

const EMAIL = 'redis-e2e@lab.local';
const PASS = 'pass1234';

describe('auth + redis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let redisAvailable = false;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    // 等 ioredis ready (最多 1.5s)
    for (let i = 0; i < 15; i++) {
      if (redis.isReady()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    redisAvailable = await redis.__ping();
    if (!redisAvailable) {
      // eslint-disable-next-line no-console
      console.warn('[auth-redis.e2e] redis unavailable, all tests will be skipped');
      return;
    }

    // 准备用户
    await prisma.userRole.deleteMany({ where: { user: { email: EMAIL } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: EMAIL, name: 'RedisE2E', password: PASS });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    redis.__enable();
    await redis.__flushdb();
  });

  const itOrSkip = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!redisAvailable) {
        // eslint-disable-next-line no-console
        console.warn(`[auth-redis.e2e] skip "${name}" (redis down)`);
        return;
      }
      await fn();
    });
  };

  itOrSkip('logout 后旧 access 立即 401 token revoked', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: PASS });
    const { accessToken } = expectOk(login);

    // 登出
    const lo = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expectOk(lo);

    // 立刻拿旧 access 调 /auth/me
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expectBizError(me, 401);
  });

  itOrSkip('logout 时 redis 不可用: 200 但 access 仍可用 (fail-open)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: PASS });
    const { accessToken } = expectOk(login);

    redis.__disable();
    const lo = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expectOk(lo);

    // jwt guard 查黑名单也会 fail-open, /auth/me 仍可
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expectOk(me);
    redis.__enable();
  });

  itOrSkip('同 IP 60s 内第 11 次 login 触发 IP 桶限流', async () => {
    // limit=10/60s, 用错密码避免污染账号桶 (account 桶 limit=5 会先炸)
    // 改造: 用不同 email 让 account 桶散开, IP 桶累计
    for (let i = 0; i < 10; i++) {
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `none-${i}@lab.local`, password: 'x' });
      // 前 10 次走到 IP=10, account=1 (不同 email), 期望 401 (账号不存在)
      expectBizError(r, 401);
    }
    const r11 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `none-extra@lab.local`, password: 'x' });
    // 第 11 次 IP 桶炸 → 429
    expect(r11.body.code).toBe(429);
    expect(r11.headers['retry-after']).toBeDefined();
  });

  itOrSkip('同 email 60s 内第 6 次 login 触发账号桶限流 (先于 IP)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: 'wrong' });
      expectBizError(r, 401);
    }
    const r6 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: 'wrong' });
    expect(r6.body.code).toBe(429);
    expect(r6.headers['retry-after']).toBeDefined();
  });

  itOrSkip('GET /auth/me 无 @RateLimit, 高频也 200', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: PASS });
    const { accessToken } = expectOk(login);

    for (let i = 0; i < 20; i++) {
      const r = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expectOk(r);
    }
  });

  itOrSkip('不同 email 同 IP 第 10 次 login 仍 200 (IP 桶 ≤ limit)', async () => {
    // 用不同 email 让账号桶散开 (每个 email 仅 1 次), IP 桶累计到 10 = limit
    for (let i = 0; i < 9; i++) {
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `not-${i}@lab.local`, password: 'x' });
      expectBizError(r, 401);
    }
    const r10 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `not-9@lab.local`, password: 'x' });
    // 第 10 次 IP 桶 incr=10 (=limit), 仍未超
    expectBizError(r10, 401);
  });

  itOrSkip('access 被黑后, refresh 仍能换出新 access', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: PASS });
    const { accessToken, refreshToken } = expectOk(login);

    // 登出, 把 access 黑掉
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    // 旧 access 应不可用
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expectBizError(me, 401);

    // 但 refresh 仍能换新
    const rf = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    const { accessToken: newAccess } = expectOk(rf);
    expect(newAccess).toBeDefined();

    // 新 access 能用
    const me2 = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${newAccess}`);
    expectOk(me2);
  });
});
```

- [ ] **Step 2: 起 redis**

```bash
docker compose up -d redis
```

- [ ] **Step 3: 跑新 e2e**

```bash
pnpm --filter @app/api test:e2e -- --testPathPattern=auth-redis.e2e
```

Expected：7/7 pass，< 10s。

- [ ] **Step 4: 停 redis 验证自跳过**

```bash
docker compose stop redis
pnpm --filter @app/api test:e2e -- --testPathPattern=auth-redis.e2e
```

Expected：beforeAll 警告 redis unavailable，所有 it 内部 console.warn skip，整体 pass（无 failed）。

跑完重启 redis：

```bash
docker compose up -d redis
```

- [ ] **Step 5: 提交**

```bash
git add apps/api/test/auth-redis.e2e-spec.ts
git commit -m "test(api): 新增 auth-redis.e2e (黑名单/限流/fail-open, 7 it)"
```

---

## Task 13：全套 e2e 验收 + 手动验证

**Files:** （无修改，仅运行）

- [ ] **Step 1: 起 redis**

```bash
docker compose up -d redis postgres
```

- [ ] **Step 2: 全 e2e**

```bash
pnpm --filter @app/api test:e2e
```

Expected：旧 137 个 + 新 7 个全过；如果原本就有的 14 个 requests 失败属于既存问题（参见 `project_tech_debt_complete.md`），需与现状一致即可。

- [ ] **Step 3: build 校验**

```bash
pnpm --filter @app/api build
```

Expected：0 错误。

- [ ] **Step 4: 手动冒烟**

启动 dev server：

```bash
pnpm --filter @app/api start:dev
```

在另一个终端：

```bash
# 登录拿 access
LOGIN=$(curl -s -X POST localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@lab.local","password":"admin123"}')
echo $LOGIN
TOKEN=$(echo $LOGIN | jq -r .data.accessToken)

# 拿 me 正常
curl -s localhost:3001/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

# 登出
curl -s -X POST localhost:3001/api/v1/auth/logout -H "Authorization: Bearer $TOKEN"

# 再拿 me, 应该 401 token revoked
curl -s localhost:3001/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected：第二次 `/auth/me` 返回 `{"code":401,"msg":"token revoked","data":null}`。

```bash
# 连续打 11 次错密码登录验证限流
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3001/api/v1/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"never-exists@example.com","password":"x"}'
done
echo
```

Expected：前 10 次输出 200（业务 code=401），第 11 次 200（业务 code=429），最后一次 response 有 `Retry-After` header（可用 `-D -` 查看）。

- [ ] **Step 5: 健康检查**

```bash
curl -s localhost:3001/api/v1/health
```

Expected：`{"status":"ok","redis":"up"}`。

- [ ] **Step 6: tag**

```bash
git tag api-redis-introduction-complete
```

- [ ] **Step 7: 写 auto memory（仅在 verification 通过后）**

按 CLAUDE.md auto memory 规范在 `~/.claude/projects/D--Project-0417-any-demo/memory/` 新增一条 project 类记忆，并在 `MEMORY.md` 加一行索引：

```
- [api Redis 引入完成](project_api_redis_introduction.md) — RedisModule + access jti 黑名单 + @RateLimit 装饰器；e2e 新增 7 it（redis 不通自跳过）；tag api-redis-introduction-complete
```

---

## 验收总清单

- [ ] redis 起着：`pnpm --filter @app/api test:e2e` 旧 137 + 新 7 全过
- [ ] redis 停着：新 7 个 it 全部 self-skip，旧 137 仍全过
- [ ] `pnpm --filter @app/api build` 0 错误
- [ ] 手动 logout → 旧 access 401 `token revoked`
- [ ] 手动连打 11 次 login → 第 11 次 code=429 + `Retry-After` header
- [ ] `/health` 返回 `redis:'up'`
- [ ] `.env.example` 增 3 个新变量
- [ ] tag `api-redis-introduction-complete` 已打
