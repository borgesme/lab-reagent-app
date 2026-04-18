# P3 · 领用流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现普通试剂领用工作流 —— 申请(PENDING) → LAB_HEAD 审批(APPROVED/REJECTED) → REAGENT_ADMIN 发放(ISSUED)，含事务性库存扣减、按角色 lab 数据隔离、全量审计日志；Web 端提供"我的申请"、"待我审批"、"发放管理"三个页面。

**Architecture:** Prisma 增加 `Request` / `Approval` / `IssueRecord` 三个模型与 `RequestStatus` / `ApprovalAction` 两个 enum。后端新增 `RequestsModule`，内含 `requests` / `approvals` / `issues` 三对 service+controller。`Request` 带 `labId`，按角色 scope 过滤。发放时用 Prisma `$transaction` 原子完成"二次校验库存 + 扣减 currentQty + 创建 IssueRecord + 置 Request.status=ISSUED"。Web 端新增 `/my/requests`、`/approvals`、`/admin/issues` 三个路由。

**Tech Stack:** 继承 P2（NestJS / Prisma / Next.js / class-validator）。新依赖：无（`$transaction` Prisma 自带）。

**Spec:** `docs/superpowers/specs/2026-04-18-lab-reagent-app-design.md` §4.1–4.2（Request / Approval / IssueRecord 字段）、§5.1（普通试剂领用流程）、§6（权限矩阵：提交领用 / 审批普通试剂 / 发放试剂）。

**Prerequisites:** P2 已完成（commit `b285af7` 及之前），`admin@lab.local` / `admin123` 可登录，`Reagent` 与 `ReagentStock` CRUD + 种子数据 ok，后端 e2e 23 tests 全绿。

---

## File Structure

```
apps/api/
├─ prisma/
│  └─ schema.prisma                            # 增加 Request/Approval/IssueRecord + 两个 enum
└─ src/
   └─ requests/
      ├─ requests.module.ts
      ├─ requests.service.ts
      ├─ requests.controller.ts
      ├─ approvals.service.ts
      ├─ approvals.controller.ts
      ├─ issues.service.ts
      ├─ issues.controller.ts
      └─ dto/
         ├─ create-request.dto.ts
         ├─ query-request.dto.ts
         ├─ approve-request.dto.ts
         └─ issue-request.dto.ts

apps/web/src/app/
├─ my/
│  └─ requests/page.tsx                        # 我的申请 + 新建表单 + 取消
├─ approvals/page.tsx                          # 待我审批（LAB_HEAD）
└─ admin/
   └─ issues/page.tsx                          # 待发放 / 已发放台账（REAGENT_ADMIN）

apps/web/src/app/admin/layout.tsx              # 侧栏加"审批"/"发放"
apps/web/src/app/page.tsx                      # 首页加"我的申请"入口

packages/shared/src/api-types.ts               # 追加 RequestStatus / RequestSummary / IssueSummary
```

**决策：**
- `Request.labId` 在创建时由后端根据 applicant.labId 写入（避免前端伪造 lab）
- 领用创建即 `PENDING`（P3 不实现 "草稿 DRAFT"）
- 状态机：`PENDING → APPROVED/REJECTED`、`PENDING → CANCELLED`、`APPROVED → ISSUED`；`CLOSED` 保留 enum 但 P3 不触发
- 发放 quantity 与 currentQty 均为 `Decimal(12, 3)`；事务二次校验后用 `prisma.reagentStock.update` 内的 `decrement`
- 所有写接口挂 `@Audit`（`REQUEST_CREATE` / `REQUEST_CANCEL` / `REQUEST_APPROVE` / `REQUEST_REJECT` / `REQUEST_ISSUE`）

---

## Task 1: Prisma schema — Request / Approval / IssueRecord

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_request_flow/migration.sql`（由 `prisma migrate` 生成）

- [ ] **Step 1: 在 schema 末尾追加 enum 与 model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
enum RequestStatus {
  DRAFT
  PENDING
  APPROVED
  REJECTED
  ISSUED
  CANCELLED
  CLOSED
}

enum ApprovalAction {
  APPROVE
  REJECT
}

model Request {
  id             String        @id @default(cuid())
  applicantId    String
  labId          String
  reagentId      String
  stockId        String
  quantity       Decimal       @db.Decimal(12, 3)
  unit           String
  purpose        String
  projectRef     String?
  useLocation    String?
  status         RequestStatus @default(PENDING)
  rejectedReason String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  applicant User         @relation("RequestApplicant", fields: [applicantId], references: [id])
  lab       Lab          @relation(fields: [labId], references: [id])
  reagent   Reagent      @relation(fields: [reagentId], references: [id])
  stock     ReagentStock @relation(fields: [stockId], references: [id])
  approvals Approval[]
  issue     IssueRecord?

  @@index([applicantId])
  @@index([labId, status])
  @@index([status])
}

model Approval {
  id         String         @id @default(cuid())
  requestId  String
  approverId String
  action     ApprovalAction
  comment    String?
  createdAt  DateTime       @default(now())

  request  Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
  approver User    @relation("ApprovalBy", fields: [approverId], references: [id])

  @@index([requestId])
}

model IssueRecord {
  id         String   @id @default(cuid())
  requestId  String   @unique
  issuerId   String
  receiverId String
  actualQty  Decimal  @db.Decimal(12, 3)
  stockId    String
  createdAt  DateTime @default(now())

  request  Request      @relation(fields: [requestId], references: [id], onDelete: Cascade)
  issuer   User         @relation("IssueRecordIssuer", fields: [issuerId], references: [id])
  receiver User         @relation("IssueRecordReceiver", fields: [receiverId], references: [id])
  stock    ReagentStock @relation(fields: [stockId], references: [id])

  @@index([stockId])
}
```

- [ ] **Step 2: 在已有 model 上追加反向关系**

在 `Lab` model（原 `users User[]` / `stocks ReagentStock[]` 之后）追加：

```prisma
  requests  Request[]
```

在 `User` model（原 `roles UserRole[]` / `lab Lab?` 之后）追加：

```prisma
  requests         Request[]     @relation("RequestApplicant")
  approvalsGiven   Approval[]    @relation("ApprovalBy")
  issuedRecords    IssueRecord[] @relation("IssueRecordIssuer")
  receivedRecords  IssueRecord[] @relation("IssueRecordReceiver")
```

在 `Reagent` model（原 `stocks ReagentStock[]` 之后）追加：

```prisma
  requests Request[]
```

在 `ReagentStock` model（原 `lab Lab @relation...` 之后）追加：

```prisma
  requests Request[]
  issues   IssueRecord[]
```

- [ ] **Step 3: 生成迁移**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm prisma migrate dev --name add_request_flow
```
Expected: 迁移文件生成并应用，Prisma Client 重新生成，无报错。

- [ ] **Step 4: 验证既有测试未被破坏**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -10
```
Expected: 既有 9 suites / 23 tests 仍全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/prisma
git commit -m "feat(api): add Request/Approval/IssueRecord schema"
```

---

## Task 2: Requests 模块 — 申请创建 / 查询 / 取消

**Files:**
- Create: `apps/api/src/requests/requests.module.ts`
- Create: `apps/api/src/requests/requests.service.ts`
- Create: `apps/api/src/requests/requests.controller.ts`
- Create: `apps/api/src/requests/dto/create-request.dto.ts`
- Create: `apps/api/src/requests/dto/query-request.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/requests.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;
  let plainUserId: string;
  let reagentId: string;
  let stockId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.issueRecord.deleteMany({});
    await prisma.approval.deleteMany({});
    await prisma.request.deleteMany({});

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'requester@lab.local', name: 'Requester', password: 'pass1234' });
    const reqLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'requester@lab.local', password: 'pass1234' });
    plainToken = reqLogin.body.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'requester@lab.local' } });
    plainUserId = u!.id;
    await prisma.user.update({
      where: { id: plainUserId },
      data: { labId: 'lab-default' },
    });

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-req-test' },
      update: {},
      create: { id: 'reagent-req-test', name: 'TestReagent-ReqFlow', category: '有机' },
    });
    reagentId = reagent.id;

    const stock = await prisma.reagentStock.create({
      data: {
        reagentId,
        labId: 'lab-default',
        batchNo: 'ReqBatch-01',
        initialQty: '1000',
        currentQty: '1000',
        unit: 'mL',
      },
    });
    stockId = stock.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('applicant creates request (PENDING)', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '50',
        unit: 'mL',
        purpose: '做反应实验',
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.labId).toBe('lab-default');
    expect(r.body.applicantId).toBe(plainUserId);
  });

  it('applicant lists only own requests', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.every((x: any) => x.applicantId === plainUserId)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('SYS_ADMIN lists all', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('rejects request when quantity exceeds stock', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '99999',
        unit: 'mL',
        purpose: '超库存申请',
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/stock|库存/i);
  });

  it('applicant cancels own pending request', async () => {
    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '待取消',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
  });

  it('cannot cancel other user request', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'other@lab.local', name: 'Other', password: 'pass1234' });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'other@lab.local', password: 'pass1234' });

    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '非法取消测试',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);
    expect(r.status).toBe(403);
  });
});
```

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e -- --testPathPattern=requests 2>&1 | tail -10
```
Expected: FAIL（端点不存在）。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/requests/dto/create-request.dto.ts`:

```ts
import {
  IsDecimal,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRequestDto {
  @IsString() reagentId!: string;
  @IsString() stockId!: string;
  @IsDecimal({ decimal_digits: '0,3' }) quantity!: string;
  @IsString() @MinLength(1) unit!: string;
  @IsString() @MinLength(1) @MaxLength(500) purpose!: string;
  @IsOptional() @IsString() @MaxLength(200) projectRef?: string;
  @IsOptional() @IsString() @MaxLength(200) useLocation?: string;
}
```

Create `apps/api/src/requests/dto/query-request.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class QueryRequestDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
}
```

- [ ] **Step 3: 实现 RequestsService**

Create `apps/api/src/requests/requests.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}

  async list(query: QueryRequestDto, actor: ActorContext) {
    const where: Prisma.RequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reagentId) where.reagentId = query.reagentId;

    if (actor.roles.includes('SYS_ADMIN')) {
      if (query.labId) where.labId = query.labId;
    } else if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (!user?.labId) throw new ForbiddenException('user has no lab');
      where.labId = user.labId;
    } else {
      where.applicantId = actor.sub;
    }

    return this.prisma.request.findMany({
      where,
      include: {
        reagent: true,
        stock: true,
        lab: true,
        applicant: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({
      where: { id },
      include: {
        reagent: true,
        stock: true,
        lab: true,
        applicant: { select: { id: true, name: true, email: true } },
        approvals: { include: { approver: { select: { id: true, name: true } } } },
        issue: true,
      },
    });
    if (!req) throw new NotFoundException();
    await this.assertReadAccess(req.applicantId, req.labId, actor);
    return req;
  }

  async create(dto: CreateRequestDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');

    const stock = await this.prisma.reagentStock.findUnique({
      where: { id: dto.stockId },
    });
    if (!stock || stock.deletedAt) throw new BadRequestException('stock not found');
    if (stock.reagentId !== dto.reagentId) {
      throw new BadRequestException('stock does not belong to reagent');
    }
    if (stock.labId !== user.labId) {
      throw new BadRequestException('stock not in your lab');
    }
    if (new Prisma.Decimal(dto.quantity).gt(stock.currentQty)) {
      throw new BadRequestException('quantity exceeds current stock');
    }

    return this.prisma.request.create({
      data: {
        applicantId: actor.sub,
        labId: user.labId,
        reagentId: dto.reagentId,
        stockId: dto.stockId,
        quantity: dto.quantity,
        unit: dto.unit,
        purpose: dto.purpose,
        projectRef: dto.projectRef,
        useLocation: dto.useLocation,
        status: RequestStatus.PENDING,
      },
    });
  }

  async cancel(id: string, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.applicantId !== actor.sub && !actor.roles.includes('SYS_ADMIN')) {
      throw new ForbiddenException('only applicant can cancel');
    }
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('only PENDING can be cancelled');
    }
    return this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED },
    });
  }

  private async assertReadAccess(
    applicantId: string,
    labId: string,
    actor: ActorContext,
  ) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (applicantId === actor.sub) return;
    if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (user?.labId === labId) return;
    }
    throw new ForbiddenException();
  }
}
```

- [ ] **Step 4: 实现 Controller 与 Module**

Create `apps/api/src/requests/requests.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Query() q: QueryRequestDto, @CurrentUser() user: any) {
    return this.requests.list(q, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.get(id, user);
  }

  @Post()
  @Audit({ action: 'REQUEST_CREATE', entityType: 'Request' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: any) {
    return this.requests.create(dto, user);
  }

  @Post(':id/cancel')
  @Audit({ action: 'REQUEST_CANCEL', entityType: 'Request' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.cancel(id, user);
  }
}
```

Create `apps/api/src/requests/requests.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({
  providers: [RequestsService],
  controllers: [RequestsController],
  exports: [RequestsService],
})
export class RequestsModule {}
```

Modify `apps/api/src/app.module.ts` —— 在 imports 数组中追加 `RequestsModule`：

```ts
import { RequestsModule } from './requests/requests.module';
// ... imports 数组包含:
// ConfigModule.forRoot({ isGlobal: true }),
// PrismaModule, AuthModule, UsersModule, LabsModule, RolesModule,
// ReagentsModule, StocksModule,
// RequestsModule,
```

- [ ] **Step 5: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -15
```
Expected: `requests.e2e-spec.ts` 6 个 case PASS；其他 9 个 suite 仍绿。

- [ ] **Step 6: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add reagent request submit/list/cancel"
```

---

## Task 3: Approvals — LAB_HEAD 审批 / 拒绝

**Files:**
- Create: `apps/api/src/requests/approvals.service.ts`
- Create: `apps/api/src/requests/approvals.controller.ts`
- Create: `apps/api/src/requests/dto/approve-request.dto.ts`
- Modify: `apps/api/src/requests/requests.module.ts`
- Test: append cases to `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `apps/api/test/requests.e2e-spec.ts` 的 `describe('Requests', ...)` 内追加（`afterAll` 之前）：

```ts
  describe('approvals', () => {
    let labHeadToken: string;
    let labHeadId: string;
    let pendingRequestId: string;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'labhead@lab.local', name: 'LabHead', password: 'pass1234' });
      const u = await prisma.user.findUnique({ where: { email: 'labhead@lab.local' } });
      labHeadId = u!.id;
      const labHeadRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'LAB_HEAD' },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: labHeadId, roleId: labHeadRole.id } },
        update: {},
        create: { userId: labHeadId, roleId: labHeadRole.id },
      });
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'lab-default' },
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      labHeadToken = login.body.accessToken;

      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '20',
          unit: 'mL',
          purpose: '待审批测试',
        });
      pendingRequestId = create.body.id;
    });

    it('plain user cannot approve', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ action: 'APPROVE' });
      expect(r.status).toBe(403);
    });

    it('lab head approves', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE', comment: '通过' });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('APPROVED');
      expect(r.body.approval.action).toBe('APPROVE');
      expect(r.body.approval.approverId).toBe(labHeadId);
    });

    it('cannot approve already-approved request', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      expect(r.status).toBe(400);
    });

    it('lab head rejects new request with reason', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '30',
          unit: 'mL',
          purpose: '将被拒绝',
        });
      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'REJECT', comment: '用途不明' });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('REJECTED');
      expect(r.body.request.rejectedReason).toBe('用途不明');
    });
  });
```

Run test → 预期 FAIL。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/requests/dto/approve-request.dto.ts`:

```ts
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApprovalAction } from '@prisma/client';

export class ApproveRequestDto {
  @IsEnum(ApprovalAction) action!: ApprovalAction;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
```

- [ ] **Step 3: 实现 ApprovalsService**

Create `apps/api/src/requests/approvals.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalAction, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async approve(
    requestId: string,
    dto: ApproveRequestDto,
    actor: ActorContext,
  ) {
    const req = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`request is ${req.status}, not PENDING`);
    }
    await this.assertApprover(req.labId, actor);
    if (req.applicantId === actor.sub) {
      throw new ForbiddenException('cannot approve own request');
    }

    const nextStatus =
      dto.action === ApprovalAction.APPROVE
        ? RequestStatus.APPROVED
        : RequestStatus.REJECTED;

    const [approval, updated] = await this.prisma.$transaction([
      this.prisma.approval.create({
        data: {
          requestId,
          approverId: actor.sub,
          action: dto.action,
          comment: dto.comment,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          rejectedReason:
            dto.action === ApprovalAction.REJECT ? dto.comment ?? null : null,
        },
      }),
    ]);

    return { approval, request: updated };
  }

  private async assertApprover(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (!actor.roles.includes('LAB_HEAD')) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
```

- [ ] **Step 4: 实现 ApprovalsController**

Create `apps/api/src/requests/approvals.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests/:id/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @Roles('LAB_HEAD', 'SYS_ADMIN')
  @Audit({ action: 'REQUEST_APPROVE', entityType: 'Request' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.approvals.approve(id, dto, user);
  }
}
```

- [ ] **Step 5: 挂 Module**

Modify `apps/api/src/requests/requests.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';

@Module({
  providers: [RequestsService, ApprovalsService],
  controllers: [RequestsController, ApprovalsController],
  exports: [RequestsService, ApprovalsService],
})
export class RequestsModule {}
```

- [ ] **Step 6: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -15
```
Expected: requests suite 10 个 case 全 PASS；其他 suite 仍绿。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add request approval by lab head"
```

---

## Task 4: Issues — REAGENT_ADMIN 发放（事务扣库存）

**Files:**
- Create: `apps/api/src/requests/issues.service.ts`
- Create: `apps/api/src/requests/issues.controller.ts`
- Create: `apps/api/src/requests/dto/issue-request.dto.ts`
- Modify: `apps/api/src/requests/requests.module.ts`
- Test: append cases to `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `requests.e2e-spec.ts` 的 `describe('Requests', ...)` 内 `afterAll` 之前追加：

```ts
  describe('issues', () => {
    let approvedRequestId: string;
    let approvedQty = '25';

    beforeAll(async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: approvedQty,
          unit: 'mL',
          purpose: '待发放',
        });
      approvedRequestId = create.body.id;
      // find a lab head to approve
      const lh = await prisma.user.findUnique({
        where: { email: 'labhead@lab.local' },
      });
      if (!lh) throw new Error('labhead fixture missing');
      const lhLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/approvals`)
        .set('Authorization', `Bearer ${lhLogin.body.accessToken}`)
        .send({ action: 'APPROVE' });
    });

    it('plain user cannot issue', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/issues`)
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ actualQty: approvedQty });
      expect(r.status).toBe(403);
    });

    it('admin issues approved request and decrements stock', async () => {
      const stockBefore = await prisma.reagentStock.findUnique({
        where: { id: stockId },
      });
      const qtyBefore = stockBefore!.currentQty.toString();

      const r = await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: approvedQty });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('ISSUED');
      expect(r.body.issue.actualQty).toBe(approvedQty);
      expect(r.body.issue.receiverId).toBeDefined();

      const stockAfter = await prisma.reagentStock.findUnique({
        where: { id: stockId },
      });
      const delta = Number(qtyBefore) - Number(stockAfter!.currentQty);
      expect(delta).toBeCloseTo(Number(approvedQty), 3);
    });

    it('cannot issue PENDING request', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '5',
          unit: 'mL',
          purpose: 'pending not issuable',
        });
      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: '5' });
      expect(r.status).toBe(400);
    });

    it('rejects issue when actualQty exceeds current stock', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '10',
          unit: 'mL',
          purpose: '库存不足路径',
        });
      const lhLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/approvals`)
        .set('Authorization', `Bearer ${lhLogin.body.accessToken}`)
        .send({ action: 'APPROVE' });

      // drain stock to 0 before issuing
      await prisma.reagentStock.update({
        where: { id: stockId },
        data: { currentQty: '1' },
      });

      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: '10' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/stock|库存/i);

      await prisma.reagentStock.update({
        where: { id: stockId },
        data: { currentQty: '1000' },
      });
    });
  });
```

Run → 预期 FAIL。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/requests/dto/issue-request.dto.ts`:

```ts
import {
  IsDecimal,
  IsOptional,
  IsString,
} from 'class-validator';

export class IssueRequestDto {
  @IsDecimal({ decimal_digits: '0,3' }) actualQty!: string;
  @IsOptional() @IsString() receiverId?: string;
}
```

- [ ] **Step 3: 实现 IssuesService**

Create `apps/api/src/requests/issues.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IssueRequestDto } from './dto/issue-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class IssuesService {
  constructor(private prisma: PrismaService) {}

  async issue(
    requestId: string,
    dto: IssueRequestDto,
    actor: ActorContext,
  ) {
    const req = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(`request is ${req.status}, not APPROVED`);
    }
    await this.assertIssuer(req.labId, actor);

    const actualQty = new Prisma.Decimal(dto.actualQty);
    const receiverId = dto.receiverId ?? req.applicantId;

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.reagentStock.findUnique({
        where: { id: req.stockId },
      });
      if (!stock || stock.deletedAt) {
        throw new BadRequestException('stock not found');
      }
      if (actualQty.gt(stock.currentQty)) {
        throw new BadRequestException('actualQty exceeds current stock');
      }

      const issue = await tx.issueRecord.create({
        data: {
          requestId,
          issuerId: actor.sub,
          receiverId,
          actualQty: dto.actualQty,
          stockId: req.stockId,
        },
      });

      await tx.reagentStock.update({
        where: { id: req.stockId },
        data: { currentQty: { decrement: actualQty } },
      });

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.ISSUED },
      });

      return { issue, request: updated };
    });
  }

  private async assertIssuer(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (!actor.roles.includes('REAGENT_ADMIN')) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
```

- [ ] **Step 4: 实现 IssuesController**

Create `apps/api/src/requests/issues.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { IssueRequestDto } from './dto/issue-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests/:id/issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Post()
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'REQUEST_ISSUE', entityType: 'Request' })
  issue(
    @Param('id') id: string,
    @Body() dto: IssueRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.issues.issue(id, dto, user);
  }
}
```

- [ ] **Step 5: 挂 Module**

Modify `apps/api/src/requests/requests.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';

@Module({
  providers: [RequestsService, ApprovalsService, IssuesService],
  controllers: [RequestsController, ApprovalsController, IssuesController],
  exports: [RequestsService, ApprovalsService, IssuesService],
})
export class RequestsModule {}
```

- [ ] **Step 6: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -20
```
Expected: requests suite 14 个 case 全 PASS（6 base + 4 approvals + 4 issues）；其他 suite 仍绿。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add request issue with transactional stock decrement"
```

---

## Task 5: Web — 我的申请页 `/my/requests`

**Files:**
- Create: `apps/web/src/app/my/requests/page.tsx`
- Modify: `apps/web/src/app/page.tsx`（首页入口）

- [ ] **Step 1: 创建"我的申请"页**

Create `apps/web/src/app/my/requests/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface Reagent {
  id: string;
  name: string;
}

interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  reagent: { id: string; name: string };
}

interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  rejectedReason?: string | null;
  reagent: { name: string };
  stock: { batchNo?: string | null };
}

export default function MyRequestsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [reagentId, setReagentId] = useState('');
  const [stockId, setStockId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('mL');
  const [purpose, setPurpose] = useState('');

  async function refresh() {
    if (!token) return;
    try {
      const [r, rs, st] = await Promise.all([
        apiFetch<RequestItem[]>('/requests', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Stock[]>('/stocks', { token }),
      ]);
      setItems(r);
      setReagents(rs);
      setStocks(st);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/requests', {
        method: 'POST',
        token,
        body: { reagentId, stockId, quantity, unit, purpose },
      });
      setReagentId('');
      setStockId('');
      setQuantity('');
      setPurpose('');
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function onCancel(id: string) {
    try {
      await apiFetch(`/requests/${id}/cancel`, { method: 'POST', token });
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const stocksForReagent = stocks.filter(
    (s) => !reagentId || s.reagent.id === reagentId,
  );

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">我的申请</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-6 gap-2 mb-4 p-3 border rounded"
        >
          <select
            className="border p-2 col-span-2"
            value={reagentId}
            onChange={(e) => {
              setReagentId(e.target.value);
              setStockId('');
            }}
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
            className="border p-2 col-span-2"
            value={stockId}
            onChange={(e) => setStockId(e.target.value)}
            required
          >
            <option value="">选择批次</option>
            {stocksForReagent.map((s) => (
              <option key={s.id} value={s.id}>
                {s.batchNo ?? '(无批号)'} · 余 {s.currentQty}
                {s.unit}
              </option>
            ))}
          </select>
          <input
            className="border p-2"
            placeholder="数量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
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
            placeholder="用途（必填）"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
          <button className="bg-blue-600 text-white col-span-1">提交</button>
        </form>

        <table className="w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">试剂</th>
              <th className="p-2 text-left">批号</th>
              <th className="p-2 text-left">数量</th>
              <th className="p-2 text-left">用途</th>
              <th className="p-2 text-left">状态</th>
              <th className="p-2 text-left">提交时间</th>
              <th className="p-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.reagent.name}</td>
                <td className="p-2">{r.stock.batchNo ?? '-'}</td>
                <td className="p-2">
                  {r.quantity} {r.unit}
                </td>
                <td className="p-2">{r.purpose}</td>
                <td className="p-2">
                  {r.status}
                  {r.status === 'REJECTED' && r.rejectedReason && (
                    <span className="text-red-600 ml-1">
                      ({r.rejectedReason})
                    </span>
                  )}
                </td>
                <td className="p-2">{r.createdAt.slice(0, 16).replace('T', ' ')}</td>
                <td className="p-2">
                  {r.status === 'PENDING' && (
                    <button
                      className="text-red-600 underline"
                      onClick={() => onCancel(r.id)}
                    >
                      取消
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: 首页加"我的申请"入口**

覆盖 `apps/web/src/app/page.tsx`:

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8 space-y-3">
      <h1 className="text-2xl font-bold">实验室试剂管理系统</h1>
      <div className="flex flex-wrap gap-4">
        <Link href="/login" className="text-blue-600 underline">
          登录
        </Link>
        <Link href="/reagents" className="text-blue-600 underline">
          试剂百科
        </Link>
        <Link href="/my/requests" className="text-blue-600 underline">
          我的申请
        </Link>
        <Link href="/admin/users" className="text-blue-600 underline">
          管理后台
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 验证 build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -15
```
Expected: 新增 `/my/requests` 路由，build 成功。

- [ ] **Step 4: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add my requests page"
```

---

## Task 6: Web — 待我审批页 `/approvals`

**Files:**
- Create: `apps/web/src/app/approvals/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`（侧栏加"审批"）

- [ ] **Step 1: 创建审批页**

Create `apps/web/src/app/approvals/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface RequestItem {
  id: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
}

export default function ApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [commentById, setCommentById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    try {
      const data = await apiFetch<RequestItem[]>('/requests?status=PENDING', {
        token,
      });
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiFetch(`/requests/${id}/approvals`, {
        method: 'POST',
        token,
        body: { action, comment: commentById[id] },
      });
      setCommentById((m) => ({ ...m, [id]: '' }));
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">待我审批</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}
        {items.length === 0 && <p className="text-gray-500">暂无待审批申请</p>}
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="border p-3 rounded">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">
                    {r.reagent.name}
                    <span className="text-gray-500 font-normal ml-2">
                      批号 {r.stock.batchNo ?? '-'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700">
                    {r.applicant.name} ({r.applicant.email}) · 申请
                    {r.quantity}
                    {r.unit}
                  </div>
                  <div className="text-sm mt-1">用途：{r.purpose}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.createdAt.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <input
                    className="border p-1 text-sm w-60"
                    placeholder="批注（可选，拒绝时作为原因）"
                    value={commentById[r.id] ?? ''}
                    onChange={(e) =>
                      setCommentById((m) => ({ ...m, [r.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      className="bg-green-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'APPROVE')}
                    >
                      通过
                    </button>
                    <button
                      className="bg-red-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'REJECT')}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: admin 侧栏加"审批"与"发放"链接**

修改 `apps/web/src/app/admin/layout.tsx` 中的 `<aside>` 块，使其包含：

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
          <Link href="/approvals" className="block">
            审批
          </Link>
          <Link href="/admin/issues" className="block">
            发放
          </Link>
        </aside>
```

- [ ] **Step 3: 验证 build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -15
```
Expected: 出现 `/approvals` 路由。

- [ ] **Step 4: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add approvals page for lab head"
```

---

## Task 7: Web — 发放管理页 `/admin/issues`

**Files:**
- Create: `apps/web/src/app/admin/issues/page.tsx`

- [ ] **Step 1: 创建发放管理页**

Create `apps/web/src/app/admin/issues/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
}

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    try {
      const [ap, iss] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
      ]);
      setPending(ap);
      setIssued(iss);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      await apiFetch(`/requests/${r.id}/issues`, {
        method: 'POST',
        token,
        body: { actualQty },
      });
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">发放管理</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <h3 className="font-semibold mt-4 mb-2">待发放</h3>
      {pending.length === 0 && <p className="text-gray-500">无</p>}
      <ul className="space-y-2 mb-6">
        {pending.map((r) => (
          <li key={r.id} className="border p-3 rounded flex justify-between">
            <div>
              <div className="font-medium">
                {r.reagent.name} · 批号 {r.stock.batchNo ?? '-'} · 申请
                {r.quantity}
                {r.unit}
              </div>
              <div className="text-sm text-gray-700">
                {r.applicant.name} · {r.purpose}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="border p-1 w-24 text-sm"
                placeholder={`实际量 (${r.unit})`}
                value={qtyById[r.id] ?? ''}
                onChange={(e) =>
                  setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                }
              />
              <button
                className="bg-blue-600 text-white px-3 py-1 text-sm"
                onClick={() => issue(r)}
              >
                发放
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="font-semibold mt-4 mb-2">已发放台账</h3>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">试剂</th>
            <th className="p-2 text-left">批号</th>
            <th className="p-2 text-left">申请量</th>
            <th className="p-2 text-left">领用人</th>
            <th className="p-2 text-left">用途</th>
            <th className="p-2 text-left">提交时间</th>
          </tr>
        </thead>
        <tbody>
          {issued.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.reagent.name}</td>
              <td className="p-2">{r.stock.batchNo ?? '-'}</td>
              <td className="p-2">
                {r.quantity} {r.unit}
              </td>
              <td className="p-2">{r.applicant.name}</td>
              <td className="p-2">{r.purpose}</td>
              <td className="p-2">
                {r.createdAt.slice(0, 16).replace('T', ' ')}
              </td>
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
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -15
```
Expected: 出现 `/admin/issues` 路由。

- [ ] **Step 3: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add issue management page"
```

---

## Task 8: shared 类型与最终回归验证

**Files:**
- Modify: `packages/shared/src/api-types.ts`

- [ ] **Step 1: 追加类型**

在 `packages/shared/src/api-types.ts` 末尾追加：

```ts
export type RequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ISSUED'
  | 'CANCELLED'
  | 'CLOSED';

export type ApprovalAction = 'APPROVE' | 'REJECT';

export interface RequestSummary {
  id: string;
  applicantId: string;
  labId: string;
  reagentId: string;
  stockId: string;
  quantity: string;
  unit: string;
  purpose: string;
  projectRef?: string | null;
  useLocation?: string | null;
  status: RequestStatus;
  rejectedReason?: string | null;
  createdAt: string;
}

export interface ApprovalSummary {
  id: string;
  requestId: string;
  approverId: string;
  action: ApprovalAction;
  comment?: string | null;
  createdAt: string;
}

export interface IssueSummary {
  id: string;
  requestId: string;
  issuerId: string;
  receiverId: string;
  stockId: string;
  actualQty: string;
  createdAt: string;
}
```

- [ ] **Step 2: 后端 e2e 全量**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api test:e2e 2>&1 | tail -15
```
Expected: 10 个 suite（health / prisma / auth / guards / audit / users / labs / reagents / stocks / requests），至少 37 个 test case（23 原有 + 14 新增）全部 PASS。

- [ ] **Step 3: 前端单测 + build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web test 2>&1 | tail -5
pnpm --filter @app/web build 2>&1 | tail -15
```
Expected: test 2/2 PASS；build 含 `/my/requests`、`/approvals`、`/admin/issues` 三个新路由。

- [ ] **Step 4: 手动冒烟（可选）**

启动 `pnpm dev:api` 与 `pnpm dev:web`，用 admin 登录后：

1. `/admin/stocks` 给"丙酮"入库 100mL
2. 注册普通用户，登录 → `/my/requests` 申请 20mL
3. 给该普通用户绑 `lab-default`（`/admin/users` 或手动 SQL）并给 LAB_HEAD 角色的用户（自行制造）进入 `/approvals` 通过申请
4. admin 登录 → `/admin/issues` 发放 20mL
5. 验证 `/admin/stocks` 丙酮 100mL 批次余量变为 80mL

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add packages/shared
git commit -m "feat(shared): add Request/Approval/Issue types"
```

- [ ] **Step 6: 可选打 tag**

```bash
cd D:/Project/0417-any-demo
git tag p3-complete
```

---

## Definition of Done（P3 验收标准）

- [ ] Prisma 模型含 `Request`、`Approval`、`IssueRecord`、`RequestStatus`、`ApprovalAction`
- [ ] `POST /requests` 任何登录用户可提交；自动写入 `labId` 与 `applicantId`；校验 stock 归属与余量
- [ ] `GET /requests` 按角色 scope：普通用户看自己；LAB_HEAD/REAGENT_ADMIN 看本 lab；SYS_ADMIN 看全部
- [ ] `POST /requests/:id/cancel` 仅 applicant（或 SYS_ADMIN）可取消，仅 `PENDING` 可取消
- [ ] `POST /requests/:id/approvals` 仅 LAB_HEAD/SYS_ADMIN 可操作，跨 lab 返回 403，APPROVE/REJECT 正确置状态与 `rejectedReason`
- [ ] `POST /requests/:id/issues` 仅 REAGENT_ADMIN/SYS_ADMIN 可操作；事务内 currentQty 二次校验 + 扣减 + 创建 `IssueRecord` + 置 `ISSUED`
- [ ] 所有写操作在 `AuditLog` 写对应 action：`REQUEST_CREATE` / `REQUEST_CANCEL` / `REQUEST_APPROVE` / `REQUEST_ISSUE`
- [ ] Web `/my/requests`、`/approvals`、`/admin/issues` 三页面可用
- [ ] 全部后端 e2e + 前端 test + 双端 build 均绿
