# P2 · 试剂与库存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现试剂主数据（Reagent）与批次库存（ReagentStock）管理 —— 试剂百科查询、入库创建批次、库存增删改查、实验室级数据隔离，Web 端提供试剂列表与库存管理页面。

**Architecture:** Prisma 增加 `Reagent`、`ReagentStock` 两个模型及 `HazardLevel`、`ControlType` 两个 enum；后端新增 `ReagentsModule` 与 `StocksModule`，前者是全局主数据（所有登录用户可查，管理员可增改），后者按 `labId` 数据隔离（REAGENT_ADMIN 只能操作本实验室）。Web 端新增 `/reagents`、`/admin/stocks` 两个路由。

**Tech Stack:** 继承 P1。新依赖：无（Decimal 类型由 Prisma 原生支持）。

**Spec:** `docs/superpowers/specs/2026-04-18-lab-reagent-app-design.md` §4.2（Reagent / ReagentStock 字段）、§6（权限矩阵：查试剂 / 库存增删）。

**Prerequisites:** P1 已完成（commit 1c7451c 及之前），admin@lab.local / admin123 可登录，PostgreSQL 可连接。

---

## File Structure

```
apps/api/
├─ prisma/
│  └─ schema.prisma                          # 增加 Reagent / ReagentStock / enums
└─ src/
   ├─ reagents/
   │  ├─ reagents.module.ts
   │  ├─ reagents.service.ts
   │  ├─ reagents.controller.ts
   │  └─ dto/{create-reagent,update-reagent,query-reagent}.dto.ts
   └─ stocks/
      ├─ stocks.module.ts
      ├─ stocks.service.ts
      ├─ stocks.controller.ts
      └─ dto/{create-stock,update-stock,query-stock}.dto.ts

apps/web/src/app/
├─ reagents/page.tsx                         # 试剂百科（所有登录用户）
└─ admin/
   └─ stocks/page.tsx                        # 库存管理 + 入库

packages/shared/src/
└─ api-types.ts                              # 增 Reagent / Stock 类型
```

**决策：**
- `Reagent` 是全局主数据，不带 `labId`，所有登录用户可读（含 PLAIN_USER）
- `ReagentStock` 带 `labId`，REAGENT_ADMIN / LAB_HEAD 只能看到本 lab；SYS_ADMIN 看全部
- MSDS 本期仅存 URL 字段，文件上传对接 OSS 留到 P4
- 数量用 `Decimal(12, 3)`，支持到 0.001 精度

---

## Task 1: Prisma schema — Reagent / ReagentStock / enums

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_reagent_stock/migration.sql`（由 prisma migrate 自动生成）

- [ ] **Step 1: 修改 schema**

在 `apps/api/prisma/schema.prisma` 末尾添加：

```prisma
enum HazardLevel {
  NORMAL
  DANGEROUS
  CONTROLLED
}

enum ControlType {
  DRUG_PRECURSOR      // 易制毒
  EXPLOSIVE_PRECURSOR // 易制爆
  TOXIC               // 剧毒
  NARCOTIC            // 麻精
}

model Reagent {
  id            String        @id @default(cuid())
  name          String
  cas           String?
  formula       String?
  specification String?       // 规格，如 500g / 1L
  category      String?       // 有机 / 无机 / 生物 ...
  hazardLevel   HazardLevel   @default(NORMAL)
  controlType   ControlType?
  msdsFileUrl   String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  deletedAt     DateTime?
  stocks        ReagentStock[]

  @@index([name])
  @@index([cas])
}

model ReagentStock {
  id            String    @id @default(cuid())
  reagentId     String
  labId         String
  batchNo       String?
  mfgDate       DateTime?
  expireDate    DateTime?
  initialQty    Decimal   @db.Decimal(12, 3)
  currentQty    Decimal   @db.Decimal(12, 3)
  unit          String                         // g / mL / L / ...
  location      String?                        // 柜号-层号
  supplier      String?
  purchasePrice Decimal?  @db.Decimal(12, 2)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  reagent       Reagent   @relation(fields: [reagentId], references: [id])
  lab           Lab       @relation(fields: [labId], references: [id])

  @@index([reagentId])
  @@index([labId])
  @@index([expireDate])
}
```

在 `Lab` model 中追加一行关系（在 `users User[]` 下面添加）：

```prisma
  stocks    ReagentStock[]
```

- [ ] **Step 2: 生成迁移**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm prisma migrate dev --name add_reagent_stock
```
Expected: 迁移文件生成并应用，Prisma Client 重新生成。

- [ ] **Step 3: 验证**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -10
```
Expected: 原 14 个 test 仍全部 PASS（新字段不影响现有流程）。

- [ ] **Step 4: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/prisma
git commit -m "feat(api): add Reagent and ReagentStock schema"
```

---

## Task 2: Reagents 模块 — 主数据 CRUD

**Files:**
- Create: `apps/api/src/reagents/reagents.module.ts`
- Create: `apps/api/src/reagents/reagents.service.ts`
- Create: `apps/api/src/reagents/reagents.controller.ts`
- Create: `apps/api/src/reagents/dto/create-reagent.dto.ts`
- Create: `apps/api/src/reagents/dto/update-reagent.dto.ts`
- Create: `apps/api/src/reagents/dto/query-reagent.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/reagents.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/reagents.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Reagents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.reagentStock.deleteMany({});
    await prisma.reagent.deleteMany({ where: { name: { startsWith: 'TestReagent' } } });

    const r1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r1.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'plain-p2@lab.local', name: 'Plain', password: 'pass1234' });
    const r2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-p2@lab.local', password: 'pass1234' });
    plainToken = r2.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates reagent', async () => {
    const r = await request(app.getHttpServer())
      .post('/reagents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'TestReagent-Acetone',
        cas: '67-64-1',
        formula: 'C3H6O',
        specification: '500mL',
        category: '有机',
        hazardLevel: 'DANGEROUS',
      });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('TestReagent-Acetone');
  });

  it('plain user can list reagents', async () => {
    const r = await request(app.getHttpServer())
      .get('/reagents')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('plain user cannot create reagent', async () => {
    const r = await request(app.getHttpServer())
      .post('/reagents')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ name: 'TestReagent-X' });
    expect(r.status).toBe(403);
  });

  it('search by name', async () => {
    const r = await request(app.getHttpServer())
      .get('/reagents?q=Acetone')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.some((x: any) => x.name.includes('Acetone'))).toBe(true);
  });
});
```

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -5
```
Expected: `reagents.e2e-spec.ts` FAIL（端点不存在）。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/reagents/dto/create-reagent.dto.ts`:

```ts
import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { HazardLevel, ControlType } from '@prisma/client';

export class CreateReagentDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() cas?: string;
  @IsOptional() @IsString() formula?: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(HazardLevel) hazardLevel?: HazardLevel;
  @IsOptional() @IsEnum(ControlType) controlType?: ControlType;
  @IsOptional() @IsString() msdsFileUrl?: string;
}
```

Create `apps/api/src/reagents/dto/update-reagent.dto.ts`:

```ts
import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { HazardLevel, ControlType } from '@prisma/client';

export class UpdateReagentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cas?: string;
  @IsOptional() @IsString() formula?: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(HazardLevel) hazardLevel?: HazardLevel;
  @IsOptional() @IsEnum(ControlType) controlType?: ControlType;
  @IsOptional() @IsString() msdsFileUrl?: string;
}
```

Create `apps/api/src/reagents/dto/query-reagent.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class QueryReagentDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
}
```

- [ ] **Step 3: 实现 Service**

Create `apps/api/src/reagents/reagents.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReagentDto } from './dto/create-reagent.dto';
import { UpdateReagentDto } from './dto/update-reagent.dto';
import { QueryReagentDto } from './dto/query-reagent.dto';

@Injectable()
export class ReagentsService {
  constructor(private prisma: PrismaService) {}

  list(query: QueryReagentDto) {
    const where: any = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { cas: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    return this.prisma.reagent.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const r = await this.prisma.reagent.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException();
    return r;
  }

  create(dto: CreateReagentDto) {
    return this.prisma.reagent.create({ data: dto });
  }

  async update(id: string, dto: UpdateReagentDto) {
    const r = await this.prisma.reagent.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException();
    return this.prisma.reagent.update({ where: { id }, data: dto });
  }

  softDelete(id: string) {
    return this.prisma.reagent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: 实现 Controller 与 Module**

Create `apps/api/src/reagents/reagents.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReagentsService } from './reagents.service';
import { CreateReagentDto } from './dto/create-reagent.dto';
import { UpdateReagentDto } from './dto/update-reagent.dto';
import { QueryReagentDto } from './dto/query-reagent.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('reagents')
export class ReagentsController {
  constructor(private readonly reagents: ReagentsService) {}

  // 所有登录用户可查，不加 @Roles
  @Get()
  list(@Query() q: QueryReagentDto) {
    return this.reagents.list(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.reagents.get(id);
  }

  @Post()
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_CREATE', entityType: 'Reagent' })
  create(@Body() dto: CreateReagentDto) {
    return this.reagents.create(dto);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_UPDATE', entityType: 'Reagent' })
  update(@Param('id') id: string, @Body() dto: UpdateReagentDto) {
    return this.reagents.update(id, dto);
  }

  @Delete(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_DELETE', entityType: 'Reagent' })
  remove(@Param('id') id: string) {
    return this.reagents.softDelete(id);
  }
}
```

Create `apps/api/src/reagents/reagents.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReagentsService } from './reagents.service';
import { ReagentsController } from './reagents.controller';

@Module({
  providers: [ReagentsService],
  controllers: [ReagentsController],
  exports: [ReagentsService],
})
export class ReagentsModule {}
```

Modify `apps/api/src/app.module.ts` —— 在 imports 加 `ReagentsModule`：

```ts
import { ReagentsModule } from './reagents/reagents.module';
// ... 在 imports 数组中添加:
// ReagentsModule,
```

完整 imports 段应为：
```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  PrismaModule,
  AuthModule,
  UsersModule,
  LabsModule,
  RolesModule,
  ReagentsModule,
],
```

- [ ] **Step 5: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -10
```
Expected: `reagents.e2e-spec.ts` 4 个 case 全 PASS；原 14 个 case 仍 PASS。

- [ ] **Step 6: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add reagents CRUD with catalog search"
```

---

## Task 3: ReagentStock 模块 — 批次库存与入库（lab-scoped）

**Files:**
- Create: `apps/api/src/stocks/stocks.module.ts`
- Create: `apps/api/src/stocks/stocks.service.ts`
- Create: `apps/api/src/stocks/stocks.controller.ts`
- Create: `apps/api/src/stocks/dto/create-stock.dto.ts`
- Create: `apps/api/src/stocks/dto/update-stock.dto.ts`
- Create: `apps/api/src/stocks/dto/query-stock.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/stocks.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/stocks.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Stocks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.reagentStock.deleteMany({
      where: { batchNo: { startsWith: 'TestBatch' } },
    });

    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.accessToken;

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-test-stock' },
      update: {},
      create: {
        id: 'reagent-test-stock',
        name: 'TestReagent-StockFixture',
        category: '有机',
      },
    });
    reagentId = reagent.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates stock (入库)', async () => {
    const r = await request(app.getHttpServer())
      .post('/stocks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reagentId,
        labId: 'lab-default',
        batchNo: 'TestBatch-001',
        initialQty: '500',
        currentQty: '500',
        unit: 'mL',
        location: 'A-柜-1层',
      });
    expect(r.status).toBe(201);
    expect(r.body.batchNo).toBe('TestBatch-001');
    expect(r.body.reagentId).toBe(reagentId);
  });

  it('list stocks', async () => {
    const r = await request(app.getHttpServer())
      .get('/stocks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('filter by reagentId', async () => {
    const r = await request(app.getHttpServer())
      .get(`/stocks?reagentId=${reagentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.every((s: any) => s.reagentId === reagentId)).toBe(true);
  });

  it('update stock qty', async () => {
    const list = await request(app.getHttpServer())
      .get(`/stocks?reagentId=${reagentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const stockId = list.body[0].id;
    const r = await request(app.getHttpServer())
      .patch(`/stocks/${stockId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentQty: '480', location: 'A-柜-2层' });
    expect(r.status).toBe(200);
    expect(r.body.location).toBe('A-柜-2层');
  });

  it('plain user cannot create stock', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'plain-p2-stock@lab.local',
        name: 'PlainS',
        password: 'pass1234',
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-p2-stock@lab.local', password: 'pass1234' });
    const r = await request(app.getHttpServer())
      .post('/stocks')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        reagentId,
        labId: 'lab-default',
        initialQty: '100',
        currentQty: '100',
        unit: 'g',
      });
    expect(r.status).toBe(403);
  });
});
```

Run: FAIL 预期（端点不存在）。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/stocks/dto/create-stock.dto.ts`:

```ts
import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStockDto {
  @IsString() reagentId!: string;
  @IsString() labId!: string;
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsDecimal({ decimal_digits: '0,3' }) initialQty!: string;
  @IsDecimal({ decimal_digits: '0,3' }) currentQty!: string;
  @IsString() @MinLength(1) unit!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
```

Create `apps/api/src/stocks/dto/update-stock.dto.ts`:

```ts
import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateStockDto {
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,3' }) currentQty?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
```

Create `apps/api/src/stocks/dto/query-stock.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class QueryStockDto {
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
}
```

- [ ] **Step 3: 实现 Service（带 lab 级数据隔离）**

Create `apps/api/src/stocks/stocks.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryStockDto } from './dto/query-stock.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class StocksService {
  constructor(private prisma: PrismaService) {}

  async list(query: QueryStockDto, actor: ActorContext) {
    const where: any = { deletedAt: null };
    if (query.reagentId) where.reagentId = query.reagentId;
    const labFilter = await this.resolveLabFilter(query.labId, actor);
    if (labFilter) where.labId = labFilter;
    return this.prisma.reagentStock.findMany({
      where,
      include: { reagent: true, lab: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateStockDto, actor: ActorContext) {
    await this.assertLabAccess(dto.labId, actor);
    return this.prisma.reagentStock.create({
      data: {
        reagentId: dto.reagentId,
        labId: dto.labId,
        batchNo: dto.batchNo,
        mfgDate: dto.mfgDate ? new Date(dto.mfgDate) : null,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
        initialQty: dto.initialQty,
        currentQty: dto.currentQty,
        unit: dto.unit,
        location: dto.location,
        supplier: dto.supplier,
        purchasePrice: dto.purchasePrice,
      },
    });
  }

  async update(id: string, dto: UpdateStockDto, actor: ActorContext) {
    const stock = await this.prisma.reagentStock.findUnique({ where: { id } });
    if (!stock || stock.deletedAt) throw new NotFoundException();
    await this.assertLabAccess(stock.labId, actor);
    const data: any = {};
    if (dto.batchNo !== undefined) data.batchNo = dto.batchNo;
    if (dto.mfgDate) data.mfgDate = new Date(dto.mfgDate);
    if (dto.expireDate) data.expireDate = new Date(dto.expireDate);
    if (dto.currentQty !== undefined) data.currentQty = dto.currentQty;
    if (dto.unit) data.unit = dto.unit;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.supplier !== undefined) data.supplier = dto.supplier;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice;
    return this.prisma.reagentStock.update({ where: { id }, data });
  }

  async softDelete(id: string, actor: ActorContext) {
    const stock = await this.prisma.reagentStock.findUnique({ where: { id } });
    if (!stock || stock.deletedAt) throw new NotFoundException();
    await this.assertLabAccess(stock.labId, actor);
    return this.prisma.reagentStock.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async resolveLabFilter(
    requested: string | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    if (actor.roles.includes('SYS_ADMIN')) return requested ?? null;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    const labId = user?.labId ?? null;
    if (!labId) throw new ForbiddenException('user has no lab');
    if (requested && requested !== labId) throw new ForbiddenException();
    return labId;
  }

  private async assertLabAccess(
    labId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (actor.roles.includes('SYS_ADMIN')) return;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
```

- [ ] **Step 4: 实现 Controller 与 Module**

Create `apps/api/src/stocks/stocks.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryStockDto } from './dto/query-stock.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Get()
  list(@Query() q: QueryStockDto, @CurrentUser() user: any) {
    return this.stocks.list(q, user);
  }

  @Post()
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_CREATE', entityType: 'ReagentStock' })
  create(@Body() dto: CreateStockDto, @CurrentUser() user: any) {
    return this.stocks.create(dto, user);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_UPDATE', entityType: 'ReagentStock' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: any,
  ) {
    return this.stocks.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_DELETE', entityType: 'ReagentStock' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.stocks.softDelete(id, user);
  }
}
```

Create `apps/api/src/stocks/stocks.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';

@Module({
  providers: [StocksService],
  controllers: [StocksController],
  exports: [StocksService],
})
export class StocksModule {}
```

Modify `apps/api/src/app.module.ts` —— imports 加 `StocksModule`：

```ts
import { StocksModule } from './stocks/stocks.module';
// imports 数组追加:
// StocksModule,
```

完整 imports 段应为：
```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  PrismaModule,
  AuthModule,
  UsersModule,
  LabsModule,
  RolesModule,
  ReagentsModule,
  StocksModule,
],
```

- [ ] **Step 5: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -10
```
Expected: `stocks.e2e-spec.ts` 5 个 case 全 PASS，其它测试仍 PASS。

- [ ] **Step 6: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add reagent stock CRUD with lab-scoped access"
```

---

## Task 4: 扩展 seed — 加几条示例试剂

**Files:**
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: 追加示例试剂数据**

在 `apps/api/prisma/seed.ts` 的 `main()` 函数中，在创建 admin 与 UserRole upsert 之后、`console.log('seed done')` 之前，追加：

```ts
  const sampleReagents = [
    { name: '丙酮', cas: '67-64-1', formula: 'C3H6O', category: '有机', hazardLevel: 'DANGEROUS' as const },
    { name: '氯化钠', cas: '7647-14-5', formula: 'NaCl', category: '无机', hazardLevel: 'NORMAL' as const },
    { name: '硫酸', cas: '7664-93-9', formula: 'H2SO4', category: '无机', hazardLevel: 'DANGEROUS' as const },
  ];
  for (const r of sampleReagents) {
    await prisma.reagent.upsert({
      where: { id: `seed-${r.cas}` },
      update: {},
      create: { id: `seed-${r.cas}`, ...r },
    });
  }
```

- [ ] **Step 2: 运行 seed 并验证**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api prisma:seed 2>&1 | tail -3
```
Expected: `seed done` 输出，无报错。

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -8
```
Expected: 所有测试仍 PASS。

- [ ] **Step 3: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/prisma/seed.ts
git commit -m "chore(api): seed sample reagents"
```

---

## Task 5: Web 试剂百科页 `/reagents`

**Files:**
- Create: `apps/web/src/app/reagents/page.tsx`
- Modify: `apps/web/src/app/page.tsx`（加入口链接）
- Modify: `apps/web/src/app/admin/layout.tsx`（侧栏加"试剂"链接）

- [ ] **Step 1: 创建试剂百科页**

Create `apps/web/src/app/reagents/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: string;
  controlType?: string | null;
}

export default function ReagentsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<Reagent[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const data = await apiFetch<Reagent[]>(
        `/reagents${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        { token },
      );
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">试剂百科</h1>
        <div className="flex gap-2 mb-4">
          <input
            className="border p-2 flex-1"
            placeholder="搜索名称或 CAS 号"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load();
            }}
          />
          <button
            className="bg-blue-600 text-white px-4"
            onClick={load}
          >
            搜索
          </button>
        </div>
        {err && <p className="text-red-600 mb-2">{err}</p>}
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">CAS</th>
              <th className="p-2 text-left">分子式</th>
              <th className="p-2 text-left">规格</th>
              <th className="p-2 text-left">类别</th>
              <th className="p-2 text-left">危险等级</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.cas ?? '-'}</td>
                <td className="p-2">{r.formula ?? '-'}</td>
                <td className="p-2">{r.specification ?? '-'}</td>
                <td className="p-2">{r.category ?? '-'}</td>
                <td className="p-2">{r.hazardLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: 在首页加入口**

覆盖 `apps/web/src/app/page.tsx`:

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8 space-y-3">
      <h1 className="text-2xl font-bold">实验室试剂管理系统</h1>
      <div className="flex gap-4">
        <Link href="/login" className="text-blue-600 underline">
          登录
        </Link>
        <Link href="/reagents" className="text-blue-600 underline">
          试剂百科
        </Link>
        <Link href="/admin/users" className="text-blue-600 underline">
          管理后台
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 在 admin 侧栏加"试剂"链接**

覆盖 `apps/web/src/app/admin/layout.tsx` 中的 `<aside>` 块：

```tsx
        <aside className="w-48 bg-gray-100 p-4 space-y-2">
          <Link href="/admin/users" className="block">
            用户
          </Link>
          <Link href="/admin/labs" className="block">
            实验室
          </Link>
          <Link href="/admin/roles" className="block">
            角色
          </Link>
          <Link href="/reagents" className="block">
            试剂
          </Link>
          <Link href="/admin/stocks" className="block">
            库存
          </Link>
        </aside>
```

- [ ] **Step 4: 验证 build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -10
```
Expected: build 成功，`/reagents` 路由出现在列表。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add reagent catalog page"
```

---

## Task 6: Web 库存管理页 `/admin/stocks`

**Files:**
- Create: `apps/web/src/app/admin/stocks/page.tsx`

- [ ] **Step 1: 创建库存页**

Create `apps/web/src/app/admin/stocks/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  location?: string | null;
  expireDate?: string | null;
  reagent: { id: string; name: string };
  lab: { id: string; name: string };
}

interface Reagent {
  id: string;
  name: string;
}

interface Lab {
  id: string;
  name: string;
}

export default function StocksPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [reagentId, setReagentId] = useState('');
  const [labId, setLabId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('g');
  const [location, setLocation] = useState('');

  async function refresh() {
    if (!token) return;
    try {
      const [s, r, l] = await Promise.all([
        apiFetch<Stock[]>('/stocks', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Lab[]>('/labs', { token }),
      ]);
      setStocks(s);
      setReagents(r);
      setLabs(l);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onInbound(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/stocks', {
        method: 'POST',
        token,
        body: {
          reagentId,
          labId,
          batchNo: batchNo || undefined,
          initialQty: qty,
          currentQty: qty,
          unit,
          location: location || undefined,
        },
      });
      setBatchNo('');
      setQty('');
      setLocation('');
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">库存管理</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <form
        onSubmit={onInbound}
        className="grid grid-cols-6 gap-2 mb-4 p-3 border rounded"
      >
        <select
          className="border p-2 col-span-2"
          value={reagentId}
          onChange={(e) => setReagentId(e.target.value)}
          required
        >
          <option value="">选择试剂</option>
          {reagents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="border p-2"
          value={labId}
          onChange={(e) => setLabId(e.target.value)}
          required
        >
          <option value="">选择实验室</option>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          className="border p-2"
          placeholder="批号"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="数量"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          required
        />
        <input
          className="border p-2"
          placeholder="单位 g/mL"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          required
        />
        <input
          className="border p-2 col-span-5"
          placeholder="存放位置（柜号-层号）"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button className="bg-blue-600 text-white col-span-1">入库</button>
      </form>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">试剂</th>
            <th className="p-2 text-left">批号</th>
            <th className="p-2 text-left">当前量</th>
            <th className="p-2 text-left">单位</th>
            <th className="p-2 text-left">位置</th>
            <th className="p-2 text-left">有效期</th>
            <th className="p-2 text-left">实验室</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.reagent.name}</td>
              <td className="p-2">{s.batchNo ?? '-'}</td>
              <td className="p-2">{s.currentQty}</td>
              <td className="p-2">{s.unit}</td>
              <td className="p-2">{s.location ?? '-'}</td>
              <td className="p-2">
                {s.expireDate ? s.expireDate.slice(0, 10) : '-'}
              </td>
              <td className="p-2">{s.lab.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: 验证 build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -10
```
Expected: build 成功，`/admin/stocks` 路由出现。

- [ ] **Step 3: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add stock management page with inbound form"
```

---

## Task 7: shared 包追加 P2 类型

**Files:**
- Modify: `packages/shared/src/api-types.ts`

- [ ] **Step 1: 追加类型定义**

在 `packages/shared/src/api-types.ts` 末尾追加：

```ts
export type HazardLevel = 'NORMAL' | 'DANGEROUS' | 'CONTROLLED';
export type ControlType =
  | 'DRUG_PRECURSOR'
  | 'EXPLOSIVE_PRECURSOR'
  | 'TOXIC'
  | 'NARCOTIC';

export interface ReagentSummary {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: HazardLevel;
  controlType?: ControlType | null;
  msdsFileUrl?: string | null;
}

export interface StockSummary {
  id: string;
  reagentId: string;
  labId: string;
  batchNo?: string | null;
  mfgDate?: string | null;
  expireDate?: string | null;
  initialQty: string;
  currentQty: string;
  unit: string;
  location?: string | null;
  supplier?: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Project/0417-any-demo
git add packages/shared
git commit -m "feat(shared): add Reagent and Stock types"
```

---

## Task 8: 最终回归验证

**Files:** 无

- [ ] **Step 1: 后端 e2e 全量**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -15
```
Expected: 9 个 suite（health / prisma / auth / guards / audit / users / labs / reagents / stocks），至少 23 个 test case 全部 PASS。

- [ ] **Step 2: 前端单测 + build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web test 2>&1 | tail -5
pnpm --filter @app/web build 2>&1 | tail -12
```
Expected: test 2/2 PASS；build 含 `/reagents`、`/admin/stocks` 两个新路由。

- [ ] **Step 3: 手动冒烟（可选）**

启动 `pnpm dev:api` 与 `pnpm dev:web`：
1. 访问 `http://localhost:3000/login`，admin 登录
2. 访问 `/reagents` 看到 seed 的 3 条试剂
3. 访问 `/admin/stocks`，用"丙酮 + 默认实验室 + 500 + mL"入库，看到新批次出现在表格中
4. 再用普通用户（自行注册）访问 `/admin/stocks`，提交入库应被拒（403）

- [ ] **Step 4: 如有新 commit，打 tag（可选）**

```bash
cd D:/Project/0417-any-demo
git tag p2-complete
```

---

## Definition of Done（P2 验收标准）

- [ ] Prisma 模型含 `Reagent`、`ReagentStock`、`HazardLevel`、`ControlType`
- [ ] `GET /reagents` 所有登录用户可查，支持 `?q=` 搜索名称与 CAS
- [ ] `POST /reagents` 仅 SYS_ADMIN / REAGENT_ADMIN 可创建
- [ ] `GET /stocks` 按角色过滤 `labId`：非 SYS_ADMIN 只能看自己 lab
- [ ] `POST /stocks` 非同 lab 的 REAGENT_ADMIN 返回 403
- [ ] 所有写操作会在 `AuditLog` 写入对应 action（`REAGENT_*` / `STOCK_*`）
- [ ] Web `/reagents`、`/admin/stocks` 页面可用
- [ ] 全部后端 e2e + 前端 test + 双端 build 均绿
