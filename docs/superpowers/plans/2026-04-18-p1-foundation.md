# P1 · 基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建实验室试剂预约系统基础设施：monorepo 骨架、NestJS 后端、Next.js 前端、PostgreSQL + Prisma、JWT 鉴权、用户/实验室/角色管理、审计日志基线。

**Architecture:** pnpm monorepo，`apps/api`（NestJS）+ `apps/web`（Next.js），共享 `packages/shared`（类型与 DTO）。PostgreSQL + Prisma 做数据层，Redis 仅预留。JWT（access 15m + refresh 7d），RBAC 通过 NestJS Guard 实现。审计日志通过全局 Interceptor 写入。

**Tech Stack:** pnpm workspace · NestJS 10 · Next.js 14 (App Router) · TypeScript 5 · Prisma 5 · PostgreSQL 16 · Redis 7 · Docker Compose · Jest · Vitest · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-18-lab-reagent-app-design.md`

---

## File Structure

```
D:\Project\0417-any-demo\
├─ apps/
│  ├─ api/                          # NestJS 后端
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ prisma/prisma.service.ts
│  │  │  ├─ common/
│  │  │  │  ├─ guards/jwt.guard.ts
│  │  │  │  ├─ guards/roles.guard.ts
│  │  │  │  ├─ decorators/roles.decorator.ts
│  │  │  │  ├─ decorators/current-user.decorator.ts
│  │  │  │  └─ interceptors/audit.interceptor.ts
│  │  │  ├─ auth/
│  │  │  │  ├─ auth.module.ts
│  │  │  │  ├─ auth.service.ts
│  │  │  │  ├─ auth.controller.ts
│  │  │  │  └─ dto/
│  │  │  ├─ users/
│  │  │  ├─ labs/
│  │  │  └─ roles/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  ├─ test/                       # e2e tests
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ web/                           # Next.js 前端
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ layout.tsx
│     │  │  ├─ page.tsx
│     │  │  ├─ login/page.tsx
│     │  │  └─ admin/
│     │  │     ├─ users/page.tsx
│     │  │     ├─ labs/page.tsx
│     │  │     └─ roles/page.tsx
│     │  ├─ lib/
│     │  │  ├─ api-client.ts
│     │  │  └─ auth-store.ts
│     │  └─ components/
│     └─ package.json
├─ packages/
│  └─ shared/                        # 共享类型/DTO
│     ├─ src/index.ts
│     └─ package.json
├─ docker-compose.yml                # postgres + redis for dev
├─ .github/workflows/ci.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ .env.example
└─ README.md
```

**决策：**
- `apps/api` 与 `apps/web` 分开独立构建与部署
- `packages/shared` 只放纯类型与 Zod schema，不含运行时逻辑
- 审计通过 `AuditInterceptor` 在路由层捕获写操作

---

## Task 1: Monorepo 骨架与本地环境

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: 初始化 git 与根目录文件**

Run:
```bash
cd D:/Project/0417-any-demo
git init
```

Create `.gitignore`:
```
node_modules
.env
.env.local
dist
.next
coverage
*.log
```

- [ ] **Step 2: 创建 pnpm workspace**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Create `package.json`:
```json
{
  "name": "lab-reagent-app",
  "private": true,
  "scripts": {
    "dev:api": "pnpm --filter @app/api start:dev",
    "dev:web": "pnpm --filter @app/web dev",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build",
    "db:up": "docker compose up -d postgres redis",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "typescript": "5.4.5"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: 创建 docker-compose 与环境样本**

Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: lab
      POSTGRES_PASSWORD: lab
      POSTGRES_DB: lab_reagent
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

Create `.env.example`:
```
DATABASE_URL=postgresql://lab:lab@localhost:5432/lab_reagent
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change_me_access
JWT_REFRESH_SECRET=change_me_refresh
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
```

- [ ] **Step 4: 启动数据库并验证**

Run:
```bash
cp .env.example .env
pnpm db:up
docker compose ps
```
Expected: postgres 与 redis 状态均为 running。

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: init monorepo skeleton with docker-compose"
```

---

## Task 2: NestJS API 骨架与健康检查

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

- [ ] **Step 1: 初始化 apps/api**

```bash
mkdir -p apps/api/src apps/api/test
cd apps/api
```

Create `apps/api/package.json`:
```json
{
  "name": "@app/api",
  "version": "0.1.0",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "lint": "eslint \"src/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "10.3.7",
    "@nestjs/core": "10.3.7",
    "@nestjs/platform-express": "10.3.7",
    "@nestjs/config": "3.2.0",
    "reflect-metadata": "0.2.1",
    "rxjs": "7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "10.3.2",
    "@nestjs/testing": "10.3.7",
    "@types/jest": "29.5.12",
    "@types/node": "20.11.30",
    "@types/supertest": "6.0.2",
    "jest": "29.7.0",
    "supertest": "6.3.4",
    "ts-jest": "29.1.2",
    "typescript": "5.4.5",
    "eslint": "8.57.0"
  }
}
```

Create `apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `apps/api/nest-cli.json`:
```json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

- [ ] **Step 2: 写失败的 e2e 测试**

Create `apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" }
}
```

Create `apps/api/test/health.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('returns { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
pnpm install
pnpm --filter @app/api test:e2e
```
Expected: FAIL（AppModule 尚未实现）。

- [ ] **Step 4: 实现最小代码**

Create `apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() { return { status: 'ok' }; }
}
```

Create `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
```

Create `apps/api/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });
  await app.listen(3001);
}
bootstrap();
```

注意：e2e 测试请求 `/health`（无前缀），是因为 `setGlobalPrefix` 只在 listen 时生效，`supertest` 直接打 HttpServer 路径。若希望带前缀，测试改为 `/api/v1/health` 并在测试里也调用 `app.setGlobalPrefix`。这里保持测试不带前缀。

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): scaffold NestJS with health endpoint"
```

---

## Task 3: Prisma + 核心数据模型（User/Lab/Role）

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json`（加依赖与 scripts）
- Modify: `apps/api/src/app.module.ts`（引入 PrismaModule）
- Test: `apps/api/test/prisma.e2e-spec.ts`

- [ ] **Step 1: 加 Prisma 依赖**

更新 `apps/api/package.json`，在 dependencies 加：
```json
"@prisma/client": "5.11.0"
```
devDependencies 加：
```json
"prisma": "5.11.0"
```
scripts 加：
```json
"prisma:generate": "prisma generate",
"prisma:migrate": "prisma migrate dev",
"prisma:seed": "ts-node prisma/seed.ts"
```

Run `pnpm install`.

- [ ] **Step 2: 写 schema**

Create `apps/api/prisma/schema.prisma`:
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum RoleCode {
  PLAIN_USER
  LAB_HEAD
  REAGENT_ADMIN
  SAFETY_OFFICER
  SYS_ADMIN
}

model Lab {
  id            String   @id @default(cuid())
  name          String
  building      String?
  tenantId      String   @default("default")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?
  users         User[]
  @@index([tenantId])
}

model User {
  id           String      @id @default(cuid())
  email        String      @unique
  name         String
  phone        String?
  passwordHash String
  labId        String?
  lab          Lab?        @relation(fields: [labId], references: [id])
  roles        UserRole[]
  wechatOpenId String?     @unique
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  deletedAt    DateTime?
}

model Role {
  id    String   @id @default(cuid())
  code  RoleCode @unique
  name  String
  users UserRole[]
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  action     String
  entityType String
  entityId   String?
  before     Json?
  after      Json?
  ip         String?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId])
  @@index([actorId, createdAt])
}
```

- [ ] **Step 3: 生成 client 与迁移**

```bash
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma migrate dev --name init
```
Expected: 生成 `prisma/migrations/*_init/`，数据库建表成功。

- [ ] **Step 4: 写 PrismaService 与测试**

Create `apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

Create `apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

Update `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

Create `apps/api/test/prisma.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('PrismaService', () => {
  let svc: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    svc = mod.get(PrismaService);
    await svc.$connect();
  });
  afterAll(async () => { await svc.$disconnect(); });

  it('connects to db', async () => {
    const result = await svc.$queryRaw`SELECT 1 as n`;
    expect(result).toBeDefined();
  });
});
```

Run:
```bash
pnpm --filter @app/api test:e2e
```
Expected: 两个 suite 全 PASS。

- [ ] **Step 5: 写 seed（内置 5 个角色 + 默认实验室 + sysadmin 账户）**

Create `apps/api/prisma/seed.ts`:
```ts
import { PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roleList: { code: RoleCode; name: string }[] = [
    { code: 'PLAIN_USER', name: '普通使用者' },
    { code: 'LAB_HEAD', name: '实验室负责人' },
    { code: 'REAGENT_ADMIN', name: '试剂管理员' },
    { code: 'SAFETY_OFFICER', name: '安全员' },
    { code: 'SYS_ADMIN', name: '系统管理员' },
  ];
  for (const r of roleList) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  const lab = await prisma.lab.upsert({
    where: { id: 'lab-default' },
    update: {},
    create: { id: 'lab-default', name: '默认实验室' },
  });

  const sysRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SYS_ADMIN' } });
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lab.local' },
    update: {},
    create: { email: 'admin@lab.local', name: '系统管理员', passwordHash, labId: lab.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: sysRole.id } },
    update: {},
    create: { userId: admin.id, roleId: sysRole.id },
  });
  console.log('seed done');
}
main().finally(() => prisma.$disconnect());
```

添加 `bcryptjs`：在 `apps/api/package.json` dependencies 加 `"bcryptjs": "2.4.3"`，devDependencies 加 `"@types/bcryptjs": "2.4.6"`，`"ts-node": "10.9.2"`。

Run:
```bash
pnpm install
pnpm --filter @app/api prisma:seed
```
Expected: 控制台输出 `seed done`。

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add prisma with User/Lab/Role schema and seed"
```

---

## Task 4: JWT 鉴权（register / login / refresh）

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: 加依赖**

`apps/api/package.json` dependencies 加：
```json
"@nestjs/jwt": "10.2.0",
"@nestjs/passport": "10.0.3",
"passport": "0.7.0",
"passport-jwt": "4.0.1",
"class-validator": "0.14.1",
"class-transformer": "0.5.1"
```
devDependencies 加：
```json
"@types/passport-jwt": "4.0.1"
```
Run `pnpm install`.

- [ ] **Step 2: 写失败的 e2e 测试**

Create `apps/api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: 'alice@lab.local' } });
  });
  afterAll(async () => { await app.close(); });

  it('POST /auth/register creates user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@lab.local', name: 'Alice', password: 'pass1234' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@lab.local');
  });

  it('POST /auth/login returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'pass1234' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('POST /auth/login wrong password returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
```

Run `pnpm --filter @app/api test:e2e`. Expected: FAIL（endpoint 不存在）。

- [ ] **Step 3: 实现 DTO**

Create `apps/api/src/auth/dto/register.dto.ts`:
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';
export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8) password!: string;
}
```

Create `apps/api/src/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsString } from 'class-validator';
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
```

- [ ] **Step 4: 实现 AuthService**

Create `apps/api/src/auth/auth.service.ts`:
```ts
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const plainRole = await this.prisma.role.findUniqueOrThrow({ where: { code: 'PLAIN_USER' } });
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
    return this.issueTokens(user.id, roles);
  }

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      return this.issueTokens(payload.sub, payload.roles);
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async issueTokens(sub: string, roles: string[]) {
    const accessToken = await this.jwt.signAsync(
      { sub, roles },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub, roles },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 5: 实现 Controller 与 Module**

Create `apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body('refreshToken') token: string) { return this.auth.refresh(token); }
}
```

Create `apps/api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

Update `apps/api/src/app.module.ts` — 在 imports 加 `AuthModule`：
```ts
import { AuthModule } from './auth/auth.module';
// ...
imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
```

Update `apps/api/src/main.ts` 加全局 ValidationPipe：
```ts
import { ValidationPipe } from '@nestjs/common';
// 在 app.enableCors 前加：
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: 所有测试 PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): implement JWT auth (register/login/refresh)"
```

---

## Task 5: JWT Guard + Roles Guard + 装饰器

**Files:**
- Create: `apps/api/src/common/strategies/jwt.strategy.ts`
- Create: `apps/api/src/common/guards/jwt.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/src/common/decorators/public.decorator.ts`
- Modify: `apps/api/src/app.module.ts`（全局 Guard）
- Modify: `apps/api/src/auth/auth.controller.ts`（标注 Public）
- Test: `apps/api/test/guards.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/guards.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, Controller, Get, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';

@Controller('test-admin')
class TestAdminController {
  @Get() @Roles('SYS_ADMIN')
  onlyAdmin(@CurrentUser() u: any) { return { sub: u.sub }; }
}

describe('Guards', () => {
  let app: INestApplication;
  let accessToken: string;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAdminController],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // seeded admin
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    accessToken = res.body.accessToken;
  });
  afterAll(async () => { await app.close(); });

  it('missing token → 401', async () => {
    const r = await request(app.getHttpServer()).get('/test-admin');
    expect(r.status).toBe(401);
  });

  it('admin token → 200', async () => {
    const r = await request(app.getHttpServer())
      .get('/test-admin').set('Authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
  });
});
```

Run `pnpm --filter @app/api test:e2e`. Expected: FAIL（装饰器未实现）。

- [ ] **Step 2: 实现装饰器**

Create `apps/api/src/common/decorators/public.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Create `apps/api/src/common/decorators/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
```

Create `apps/api/src/common/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 3: 实现 JWT Strategy 与 Guard**

Create `apps/api/src/common/strategies/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }
  async validate(payload: { sub: string; roles: string[] }) {
    return { sub: payload.sub, roles: payload.roles };
  }
}
```

Create `apps/api/src/common/guards/jwt.guard.ts`:
```ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }
  canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(ctx);
  }
}
```

Create `apps/api/src/common/guards/roles.guard.ts`:
```ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user?.roles?.some((r: string) => required.includes(r as RoleCode))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

- [ ] **Step 4: 全局注册 Guards + 把 Auth 端点标为 Public**

Update `apps/api/src/app.module.ts`:
```ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtStrategy } from './common/strategies/jwt.strategy';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [HealthController],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

Update `apps/api/src/auth/auth.controller.ts`：在 class 上加 `@Public()`：
```ts
import { Public } from '../common/decorators/public.decorator';
@Public()
@Controller('auth')
export class AuthController { /* ... */ }
```

Update `apps/api/src/health/health.controller.ts`：加 `@Public()` 同上。

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add JWT/Roles guards with Public decorator"
```

---

## Task 6: 审计日志 Interceptor

**Files:**
- Create: `apps/api/src/common/interceptors/audit.interceptor.ts`
- Create: `apps/api/src/common/decorators/audit.decorator.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/audit.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/audit.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, Controller, Post, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Audit } from '../src/common/decorators/audit.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { PrismaService } from '../src/prisma/prisma.service';

@Public()
@Controller('test-audit')
class TestAuditController {
  @Post() @Audit({ action: 'TEST_CREATE', entityType: 'Test' })
  create() { return { ok: true }; }
}

describe('Audit interceptor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAuditController],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany({ where: { action: 'TEST_CREATE' } });
  });
  afterAll(async () => { await app.close(); });

  it('writes AuditLog on decorated route', async () => {
    await request(app.getHttpServer()).post('/test-audit').expect(201);
    const logs = await prisma.auditLog.findMany({ where: { action: 'TEST_CREATE' } });
    expect(logs.length).toBe(1);
    expect(logs[0].entityType).toBe('Test');
  });
});
```

Run `pnpm --filter @app/api test:e2e`. Expected: FAIL。

- [ ] **Step 2: 实现装饰器与 Interceptor**

Create `apps/api/src/common/decorators/audit.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
export const AUDIT_KEY = 'audit';
export interface AuditMeta { action: string; entityType: string }
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
```

Create `apps/api/src/common/interceptors/audit.interceptor.ts`:
```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const actorId = req.user?.sub ?? null;
    const ip = req.ip;
    const before = req.body ?? null;

    return next.handle().pipe(
      tap(async (after) => {
        await this.prisma.auditLog.create({
          data: {
            actorId, ip,
            action: meta.action,
            entityType: meta.entityType,
            entityId: (after && typeof after === 'object' && 'id' in after) ? String(after.id) : null,
            before, after: after ?? null,
          },
        });
      }),
    );
  }
}
```

Update `apps/api/src/app.module.ts`：在 providers 加：
```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
// ...
{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
```

- [ ] **Step 3: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): add global audit log interceptor"
```

---

## Task 7: Users 模块（列表 / 创建 / 更新 / 停用）

**Files:**
- Create: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/dto/create-user.dto.ts`
- Create: `apps/api/src/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/users.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: 'bob@lab.local' } });
    const r = await request(app.getHttpServer())
      .post('/auth/login').send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.accessToken;
  });
  afterAll(async () => { await app.close(); });

  it('admin creates user', async () => {
    const r = await request(app.getHttpServer())
      .post('/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'bob@lab.local', name: 'Bob', password: 'pass1234', roles: ['PLAIN_USER'] });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('bob@lab.local');
  });

  it('admin lists users', async () => {
    const r = await request(app.getHttpServer())
      .get('/users').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('non-admin cannot list', async () => {
    await request(app.getHttpServer())
      .post('/auth/register').send({ email: 'carol@lab.local', name: 'Carol', password: 'pass1234' });
    const login = await request(app.getHttpServer())
      .post('/auth/login').send({ email: 'carol@lab.local', password: 'pass1234' });
    const r = await request(app.getHttpServer())
      .get('/users').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(r.status).toBe(403);
  });
});
```

Run: FAIL 预期。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/users/dto/create-user.dto.ts`:
```ts
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleCode } from '@prisma/client';
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsArray() roles?: RoleCode[];
}
```

Create `apps/api/src/users/dto/update-user.dto.ts`:
```ts
import { IsArray, IsOptional, IsString } from 'class-validator';
import { RoleCode } from '@prisma/client';
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsArray() roles?: RoleCode[];
}
```

- [ ] **Step 3: 实现 Service**

Create `apps/api/src/users/users.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RoleCode } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { roles: { include: { role: true } }, lab: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const roleRecords = await this.resolveRoles(dto.roles ?? ['PLAIN_USER']);
    return this.prisma.user.create({
      data: {
        email: dto.email, name: dto.name, passwordHash, labId: dto.labId,
        roles: { create: roleRecords.map((r) => ({ roleId: r.id })) },
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.labId) data.labId = dto.labId;
    if (dto.roles) {
      const roleRecords = await this.resolveRoles(dto.roles);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: roleRecords.map((r) => ({ roleId: r.id })) };
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async resolveRoles(codes: RoleCode[]) {
    return this.prisma.role.findMany({ where: { code: { in: codes } } });
  }
}
```

- [ ] **Step 4: 实现 Controller 与 Module**

Create `apps/api/src/users/users.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Roles('SYS_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() list() { return this.users.list(); }

  @Post() @Audit({ action: 'USER_CREATE', entityType: 'User' })
  create(@Body() dto: CreateUserDto) { return this.users.create(dto); }

  @Patch(':id') @Audit({ action: 'USER_UPDATE', entityType: 'User' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id') @Audit({ action: 'USER_DELETE', entityType: 'User' })
  remove(@Param('id') id: string) { return this.users.softDelete(id); }
}
```

Create `apps/api/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({ providers: [UsersService], controllers: [UsersController], exports: [UsersService] })
export class UsersModule {}
```

Update `apps/api/src/app.module.ts` imports 加 `UsersModule`。

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add users CRUD with role assignment"
```

---

## Task 8: Labs 与 Roles 模块

**Files:**
- Create: `apps/api/src/labs/labs.{module,service,controller}.ts`
- Create: `apps/api/src/labs/dto/{create-lab,update-lab}.dto.ts`
- Create: `apps/api/src/roles/roles.{module,service,controller}.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/labs.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/labs.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Labs & Roles', () => {
  let app: INestApplication;
  let adminToken: string;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const r = await request(app.getHttpServer())
      .post('/auth/login').send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.accessToken;
  });
  afterAll(async () => { await app.close(); });

  it('create lab', async () => {
    const r = await request(app.getHttpServer())
      .post('/labs').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '有机化学实验室', building: '化工楼3楼' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('有机化学实验室');
  });

  it('list labs', async () => {
    const r = await request(app.getHttpServer())
      .get('/labs').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('list roles', async () => {
    const r = await request(app.getHttpServer())
      .get('/roles').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(5);
  });
});
```

Run: FAIL 预期。

- [ ] **Step 2: 实现 Labs 模块**

Create `apps/api/src/labs/dto/create-lab.dto.ts`:
```ts
import { IsOptional, IsString, MinLength } from 'class-validator';
export class CreateLabDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() building?: string;
}
```

Create `apps/api/src/labs/dto/update-lab.dto.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';
export class UpdateLabDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() building?: string;
}
```

Create `apps/api/src/labs/labs.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';

@Injectable()
export class LabsService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.lab.findMany({ where: { deletedAt: null } }); }
  create(dto: CreateLabDto) { return this.prisma.lab.create({ data: dto }); }
  async update(id: string, dto: UpdateLabDto) {
    const lab = await this.prisma.lab.findUnique({ where: { id } });
    if (!lab || lab.deletedAt) throw new NotFoundException();
    return this.prisma.lab.update({ where: { id }, data: dto });
  }
  softDelete(id: string) {
    return this.prisma.lab.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
```

Create `apps/api/src/labs/labs.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Roles('SYS_ADMIN')
@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}
  @Get() list() { return this.labs.list(); }
  @Post() @Audit({ action: 'LAB_CREATE', entityType: 'Lab' })
  create(@Body() dto: CreateLabDto) { return this.labs.create(dto); }
  @Patch(':id') @Audit({ action: 'LAB_UPDATE', entityType: 'Lab' })
  update(@Param('id') id: string, @Body() dto: UpdateLabDto) { return this.labs.update(id, dto); }
  @Delete(':id') @Audit({ action: 'LAB_DELETE', entityType: 'Lab' })
  remove(@Param('id') id: string) { return this.labs.softDelete(id); }
}
```

Create `apps/api/src/labs/labs.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { LabsService } from './labs.service';
import { LabsController } from './labs.controller';
@Module({ providers: [LabsService], controllers: [LabsController], exports: [LabsService] })
export class LabsModule {}
```

- [ ] **Step 3: 实现 Roles 模块（只读）**

Create `apps/api/src/roles/roles.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.role.findMany({ orderBy: { code: 'asc' } }); }
}
```

Create `apps/api/src/roles/roles.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Roles } from '../common/decorators/roles.decorator';

@Roles('SYS_ADMIN', 'LAB_HEAD', 'REAGENT_ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}
  @Get() list() { return this.roles.list(); }
}
```

Create `apps/api/src/roles/roles.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
@Module({ providers: [RolesService], controllers: [RolesController] })
export class RolesModule {}
```

Update `apps/api/src/app.module.ts` imports 加 `LabsModule, RolesModule`。

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm --filter @app/api test:e2e
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add labs CRUD and roles list"
```

---

## Task 9: shared 包（类型共享）

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/api-types.ts`

- [ ] **Step 1: 创建 shared 包**

Create `packages/shared/package.json`:
```json
{
  "name": "@app/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "lint": "echo noop", "test": "echo noop", "build": "tsc" },
  "devDependencies": { "typescript": "5.4.5" }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "commonjs", "strict": true,
    "declaration": true, "outDir": "dist", "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

Create `packages/shared/src/api-types.ts`:
```ts
export type RoleCode =
  | 'PLAIN_USER' | 'LAB_HEAD' | 'REAGENT_ADMIN' | 'SAFETY_OFFICER' | 'SYS_ADMIN';

export interface AuthTokens { accessToken: string; refreshToken: string }
export interface UserSummary {
  id: string; email: string; name: string;
  labId?: string | null; roles: RoleCode[];
}
```

Create `packages/shared/src/index.ts`:
```ts
export * from './api-types';
```

- [ ] **Step 2: Commit**

```bash
git add packages pnpm-lock.yaml
git commit -m "feat(shared): add shared types package"
```

---

## Task 10: Next.js Web 骨架 + 登录页

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/auth-store.ts`
- Test: `apps/web/src/lib/__tests__/api-client.test.ts`

- [ ] **Step 1: 初始化 web package.json 与 tailwind**

Create `apps/web/package.json`:
```json
{
  "name": "@app/web",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zustand": "4.5.2",
    "@app/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "@types/node": "20.11.30",
    "@types/react": "18.2.73",
    "@types/react-dom": "18.2.23",
    "tailwindcss": "3.4.3",
    "postcss": "8.4.38",
    "autoprefixer": "10.4.19",
    "vitest": "1.4.0",
    "@vitest/ui": "1.4.0",
    "jsdom": "24.0.0",
    "@testing-library/react": "14.2.2"
  }
}
```

Create `apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "ES2022"], "jsx": "preserve",
    "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next.config.mjs`:
```js
export default { experimental: { typedRoutes: true } };
```

Create `apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Create `apps/web/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 2: 写 failing test for api-client**

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', globals: true },
});
```

Create `apps/web/src/lib/__tests__/api-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api-client';

describe('apiFetch', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('attaches bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/health', { token: 'abc' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer abc');
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 401 })));
    await expect(apiFetch('/x')).rejects.toThrow();
  });
});
```

Run `pnpm install && pnpm --filter @app/web test`. Expected: FAIL。

- [ ] **Step 3: 实现 api-client 与 auth-store**

Create `apps/web/src/lib/api-client.ts`:
```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

Create `apps/web/src/lib/auth-store.ts`:
```ts
'use client';
import { create } from 'zustand';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  tokens: null, user: null,
  setSession: (tokens, user) => set({ tokens, user }),
  clear: () => set({ tokens: null, user: null }),
}));
```

- [ ] **Step 4: 写 layout / globals / 首页 / 登录页**

Create `apps/web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `apps/web/src/app/layout.tsx`:
```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '实验室试剂管理' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
```

Create `apps/web/src/app/page.tsx`:
```tsx
import Link from 'next/link';
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">实验室试剂管理系统</h1>
      <Link href="/login" className="text-blue-600 underline">登录</Link>
    </main>
  );
}
```

Create `apps/web/src/app/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState('admin@lab.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
        '/auth/login', { method: 'POST', body: { email, password } },
      );
      // 先放最小 user，后续可加 /auth/me
      setSession(res, { id: '', email, name: email, roles: [], labId: null });
      router.push('/admin/users');
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <form onSubmit={onSubmit} className="space-y-3 p-6 border rounded w-80">
        <h2 className="text-xl font-bold">登录</h2>
        <input className="w-full border p-2" value={email}
               onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" />
        <input className="w-full border p-2" type="password" value={password}
               onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
        <button className="w-full bg-blue-600 text-white p-2">登录</button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: 运行测试 + dev 手动验证**

```bash
pnpm --filter @app/web test
pnpm dev:api   # 另一终端
pnpm dev:web   # 访问 http://localhost:3000/login，能登录并跳转
```
Expected: 测试 PASS；手动登录成功跳转到 `/admin/users`（下一任务实现页面）。

- [ ] **Step 6: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js with login page"
```

---

## Task 11: Web 管理后台页面（users / labs / roles）

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/users/page.tsx`
- Create: `apps/web/src/app/admin/labs/page.tsx`
- Create: `apps/web/src/app/admin/roles/page.tsx`
- Create: `apps/web/src/components/RequireAuth.tsx`

- [ ] **Step 1: 写 RequireAuth 组件**

Create `apps/web/src/components/RequireAuth.tsx`:
```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const tokens = useAuth((s) => s.tokens);
  const router = useRouter();
  useEffect(() => { if (!tokens) router.replace('/login'); }, [tokens, router]);
  if (!tokens) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: 写 admin layout 与三个页面**

Create `apps/web/src/app/admin/layout.tsx`:
```tsx
import Link from 'next/link';
import { RequireAuth } from '@/components/RequireAuth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex min-h-screen">
        <aside className="w-48 bg-gray-100 p-4 space-y-2">
          <Link href="/admin/users" className="block">用户</Link>
          <Link href="/admin/labs" className="block">实验室</Link>
          <Link href="/admin/roles" className="block">角色</Link>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
```

Create `apps/web/src/app/admin/users/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function UsersPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [users, setUsers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<any[]>('/users', { token }).then(setUsers).catch((e) => setErr(e.message));
  }, [token]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">用户管理</h2>
      {err && <p className="text-red-600">{err}</p>}
      <table className="w-full border">
        <thead><tr className="bg-gray-50">
          <th className="p-2 text-left">邮箱</th>
          <th className="p-2 text-left">姓名</th>
          <th className="p-2 text-left">实验室</th>
          <th className="p-2 text-left">角色</th>
        </tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id} className="border-t">
            <td className="p-2">{u.email}</td>
            <td className="p-2">{u.name}</td>
            <td className="p-2">{u.lab?.name ?? '-'}</td>
            <td className="p-2">{u.roles?.map((r: any) => r.role.code).join(', ')}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
```

Create `apps/web/src/app/admin/labs/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LabsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [labs, setLabs] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');

  const refresh = () =>
    apiFetch<any[]>('/labs', { token }).then(setLabs);

  useEffect(() => { if (token) refresh(); }, [token]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/labs', { method: 'POST', body: { name, building }, token });
    setName(''); setBuilding(''); refresh();
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">实验室管理</h2>
      <form onSubmit={onCreate} className="flex gap-2 mb-4">
        <input className="border p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" />
        <input className="border p-2" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="地点" />
        <button className="bg-blue-600 text-white px-4">新增</button>
      </form>
      <ul>{labs.map((l) => <li key={l.id}>{l.name} — {l.building ?? '-'}</li>)}</ul>
    </section>
  );
}
```

Create `apps/web/src/app/admin/roles/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function RolesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [roles, setRoles] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    apiFetch<any[]>('/roles', { token }).then(setRoles);
  }, [token]);
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">角色列表</h2>
      <ul>{roles.map((r) => <li key={r.id}>{r.code} — {r.name}</li>)}</ul>
    </section>
  );
}
```

- [ ] **Step 3: 手动验证**

启动 api + web，用 admin@lab.local / admin123 登录，依次访问 `/admin/users`、`/admin/labs`、`/admin/roles`，能正常显示数据、能新增实验室。

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add admin pages for users/labs/roles"
```

---

## Task 12: CI 流水线

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 写 CI**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: lab
          POSTGRES_PASSWORD: lab
          POSTGRES_DB: lab_reagent
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U lab" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://lab:lab@localhost:5432/lab_reagent
      JWT_ACCESS_SECRET: ci_access
      JWT_REFRESH_SECRET: ci_refresh
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @app/api prisma:generate
      - run: pnpm --filter @app/api prisma migrate deploy
      - run: pnpm --filter @app/api prisma:seed
      - run: pnpm --filter @app/api test:e2e
      - run: pnpm --filter @app/web test
      - run: pnpm --filter @app/web build
      - run: pnpm --filter @app/api build
```

- [ ] **Step 2: Commit 并观察 CI 运行**

```bash
git add .github
git commit -m "chore: add GitHub Actions CI"
```
push 到远程后观察 Actions，全部步骤 green 通过。

---

## Task 13: 文档与完结

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

覆盖 `README.md`：
```markdown
# 实验室试剂预约系统

## 开发启动

1. 安装 pnpm 9+ 与 Docker
2. `cp .env.example .env`
3. `pnpm install`
4. `pnpm db:up`
5. `pnpm --filter @app/api prisma migrate dev`
6. `pnpm --filter @app/api prisma:seed`
7. `pnpm dev:api`（终端 1）
8. `pnpm dev:web`（终端 2）

默认系统管理员：`admin@lab.local` / `admin123`

## 测试

- 后端 e2e：`pnpm --filter @app/api test:e2e`
- 前端单测：`pnpm --filter @app/web test`

## 目录

- `apps/api` — NestJS 后端
- `apps/web` — Next.js 前端
- `packages/shared` — 共享类型
- `docs/superpowers/specs` — 设计文档
- `docs/superpowers/plans` — 实施计划
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README quickstart"
```

---

## Definition of Done（P1 验收标准）

- [ ] `docker compose up -d` 后 `pnpm dev:api && pnpm dev:web` 本地可跑
- [ ] 所有 e2e 测试（auth / guards / audit / users / labs / roles / prisma / health）通过
- [ ] 前端 vitest 通过
- [ ] `admin@lab.local` 登录后可进入 `/admin/users /admin/labs /admin/roles` 并看到数据
- [ ] 非 SYS_ADMIN 用户访问 `/users` 返回 403
- [ ] 任意写操作会在 `AuditLog` 表留下记录
- [ ] GitHub Actions CI 全绿
