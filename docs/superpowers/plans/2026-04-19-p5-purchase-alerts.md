# P5 · 采购与预警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现采购链路（申请 → 管理员合并批次 → 负责人审批 → 管理员入库生成新 `ReagentStock`）+ 每日 07:58 定时扫描（低库存 / 即将过期 / 管控对账异常）+ 站内消息通知 + 邮件 stub + Web 四个页面。

**Architecture:** Prisma 新增 6 个 model（PurchaseRequest / PurchaseBatch / PurchaseApproval / PurchaseReceipt / LabReagentConfig / Notification）与 3 个 enum。后端新增 3 个 Nest 模块：`purchases/` / `alerts/` / `notifications/`，其中 `alerts` 与 `purchases` 依赖 `notifications`。复用 P4 引入的 `ScheduleModule` 与 `@Audit` 机制。前端新增 `<NotificationBell/>` 全局组件与 4 个页面。

**Tech Stack:** 继承 P1-P4（NestJS 10 / Prisma 5 / PostgreSQL / Next.js 14 / class-validator / Jest / @nestjs/schedule）。不新增第三方依赖。Mailer 用 `Logger` stub。

**Spec:** `docs/superpowers/specs/2026-04-19-p5-purchase-alerts-design.md`

**Prerequisites:** P4 完成（tag `p4-complete`）、`packages/shared/package.json` 已修正为 `dist/index.js` 入口（commit `3096bc2`）。既有 `pnpm --filter @app/api test:e2e` 全绿，`pnpm --filter @app/web build` 通过。

---

## File Structure

```
apps/api/
├─ prisma/
│  ├─ schema.prisma                     # +6 model +3 enum +User/Lab/Reagent 反向关系
│  └─ migrations/<ts>_add_p5_purchase_alerts/migration.sql
└─ src/
   ├─ app.module.ts                     # +PurchasesModule +AlertsModule +NotificationsModule
   ├─ notifications/                    # NEW
   │  ├─ notifications.module.ts
   │  ├─ notifications.service.ts
   │  ├─ notifications.controller.ts
   │  ├─ mailer.service.ts
   │  └─ dto/query-notifications.dto.ts
   ├─ purchases/                        # NEW
   │  ├─ purchases.module.ts
   │  ├─ purchases.service.ts           # Request CRUD
   │  ├─ batches.service.ts             # merge / approve / receipt 事务
   │  ├─ purchases.controller.ts
   │  └─ dto/
   │     ├─ create-purchase.dto.ts
   │     ├─ merge-batch.dto.ts
   │     ├─ approve-batch.dto.ts
   │     └─ receipt-batch.dto.ts
   └─ alerts/                           # NEW
      ├─ alerts.module.ts
      ├─ alerts.service.ts              # runDaily() 暴露供测试调用
      ├─ alerts.scheduler.ts            # @Cron('58 7 * * *')
      ├─ config.service.ts              # LabReagentConfig CRUD
      ├─ alerts.controller.ts
      └─ dto/
         ├─ upsert-config.dto.ts
         └─ query-config.dto.ts

apps/api/test/                          # 新 3 个 spec
├─ notifications.e2e-spec.ts            # ~8 case
├─ purchases.e2e-spec.ts                # ~22 case
└─ alerts.e2e-spec.ts                   # ~12 case

packages/shared/src/
└─ api-types.ts                         # +PurchaseRequestSummary +PurchaseBatchSummary
                                        # +PurchaseReceiptSummary +LabReagentConfigSummary
                                        # +NotificationSummary +NotificationType
                                        # +PurchaseRequestStatus +PurchaseBatchStatus

apps/web/src/
├─ components/
│  └─ NotificationBell.tsx              # NEW 全局铃铛
├─ app/
│  ├─ layout.tsx                        # +NotificationBell 挂载入口
│  ├─ my/
│  │  └─ purchases/page.tsx             # NEW 我的采购申请
│  ├─ approvals/
│  │  └─ purchases/page.tsx             # NEW 采购批次审批
│  └─ admin/
│     ├─ layout.tsx                     # 侧栏 +「采购」+「预警配置」
│     ├─ purchases/page.tsx             # NEW 合并 + 入库
│     └─ alerts/
│        └─ config/page.tsx             # NEW LabReagentConfig CRUD
```

**关键决策复述**（来自 spec §3-§5）：
- `PurchaseRequest.batchId` 同时承担"已合并"语义，省掉关联表
- 合并 / 审批 / 入库三步都是事务，失败整体回滚
- Notification 产出必须在事务 **commit 之后** 触发；事务内不发消息
- `createIfAbsent` 按 `recipientId + type + payload->>reagentId/stockId` 当日去重
- `MailerService.send()` 吞异常（记 logger.warn），不阻断业务
- `AlertsService.runDaily()` 作为公开方法供测试直接调用，不等 cron
- `LabReagentConfig` 缺省 = 跳过 lowStock，仍跑 expiring（30 天默认）与 reconcile

---

## Task 1: Prisma migration — P5 新增 model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_p5_purchase_alerts/migration.sql`（自动生成）

- [ ] **Step 1: 修改 schema — 新增 enum**

在 `apps/api/prisma/schema.prisma` 末尾追加：

```prisma
enum PurchaseRequestStatus {
  PENDING
  MERGED
  CANCELLED
}

enum PurchaseBatchStatus {
  PENDING
  APPROVED
  REJECTED
  RECEIVED
  CANCELLED
}

enum NotificationType {
  ALERT_EXPIRING
  ALERT_LOW_STOCK
  ALERT_RECONCILE
  PURCHASE_APPROVED
  PURCHASE_REJECTED
  PURCHASE_RECEIVED
}
```

- [ ] **Step 2: 修改 schema — 新增 6 个 model**

在 enum 之后追加：

```prisma
model PurchaseRequest {
  id          String                @id @default(cuid())
  applicantId String
  labId       String
  reagentId   String
  quantity    Decimal               @db.Decimal(12, 3)
  unit        String
  reason      String
  status      PurchaseRequestStatus @default(PENDING)
  batchId     String?
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  applicant User           @relation("PurchaseApplicant", fields: [applicantId], references: [id])
  lab       Lab            @relation(fields: [labId], references: [id])
  reagent   Reagent        @relation(fields: [reagentId], references: [id])
  batch     PurchaseBatch? @relation(fields: [batchId], references: [id])

  @@index([labId, status])
  @@index([batchId])
}

model PurchaseBatch {
  id             String              @id @default(cuid())
  labId          String
  reagentId      String
  totalQty       Decimal             @db.Decimal(12, 3)
  unit           String
  status         PurchaseBatchStatus @default(PENDING)
  rejectedReason String?
  createdBy      String
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  lab       Lab                @relation(fields: [labId], references: [id])
  reagent   Reagent            @relation(fields: [reagentId], references: [id])
  creator   User               @relation("PurchaseBatchCreator", fields: [createdBy], references: [id])
  items     PurchaseRequest[]
  approvals PurchaseApproval[]
  receipt   PurchaseReceipt?

  @@index([labId, status])
}

model PurchaseApproval {
  id         String         @id @default(cuid())
  batchId    String
  approverId String
  action     ApprovalAction
  comment    String?
  createdAt  DateTime       @default(now())

  batch    PurchaseBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  approver User          @relation("PurchaseApprover", fields: [approverId], references: [id])

  @@index([batchId])
}

model PurchaseReceipt {
  id            String   @id @default(cuid())
  batchId       String   @unique
  stockId       String   @unique
  receivedBy    String
  receivedAt    DateTime @default(now())
  supplier      String?
  purchasePrice Decimal? @db.Decimal(12, 2)

  batch    PurchaseBatch @relation(fields: [batchId], references: [id])
  stock    ReagentStock  @relation(fields: [stockId], references: [id])
  receiver User          @relation("PurchaseReceiver", fields: [receivedBy], references: [id])
}

model LabReagentConfig {
  id                String   @id @default(cuid())
  labId             String
  reagentId         String
  safetyStock       Decimal  @db.Decimal(12, 3)
  expireWarningDays Int      @default(30)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  lab     Lab     @relation(fields: [labId], references: [id])
  reagent Reagent @relation(fields: [reagentId], references: [id])

  @@unique([labId, reagentId])
  @@index([labId])
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  labId       String?
  type        NotificationType
  title       String
  body        String
  payload     Json?
  readAt      DateTime?
  emailedAt   DateTime?
  createdAt   DateTime         @default(now())

  recipient User @relation("NotificationRecipient", fields: [recipientId], references: [id])

  @@index([recipientId, readAt])
  @@index([labId, type])
}
```

- [ ] **Step 3: 修改 schema — User 反向关系**

定位 `model User`，在 `witnessRecords ...` 行之后追加：

```prisma
  purchaseRequests   PurchaseRequest[]  @relation("PurchaseApplicant")
  purchaseBatches    PurchaseBatch[]    @relation("PurchaseBatchCreator")
  purchaseApprovals  PurchaseApproval[] @relation("PurchaseApprover")
  purchaseReceipts   PurchaseReceipt[]  @relation("PurchaseReceiver")
  notifications      Notification[]     @relation("NotificationRecipient")
```

- [ ] **Step 4: 修改 schema — Lab 反向关系**

定位 `model Lab`，在 `requests Request[]` 行之后追加：

```prisma
  purchaseRequests PurchaseRequest[]
  purchaseBatches  PurchaseBatch[]
  reagentConfigs   LabReagentConfig[]
```

- [ ] **Step 5: 修改 schema — Reagent 反向关系**

定位 `model Reagent`，在 `requests Request[]` 行之后追加：

```prisma
  purchaseRequests PurchaseRequest[]
  purchaseBatches  PurchaseBatch[]
  reagentConfigs   LabReagentConfig[]
```

- [ ] **Step 6: 修改 schema — ReagentStock 反向关系**

定位 `model ReagentStock`，在 `issues IssueRecord[]` 行之后追加：

```prisma
  purchaseReceipt PurchaseReceipt?
```

- [ ] **Step 7: 生成并应用迁移**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm prisma migrate dev --name add_p5_purchase_alerts
```

Expected: 生成 `prisma/migrations/<ts>_add_p5_purchase_alerts/migration.sql`，应用到 dev DB，重新生成 Prisma Client，无报错。

- [ ] **Step 8: 全量回归 e2e**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -15
```

Expected: 既有 11 suites / 59 tests 全 PASS（schema 向后兼容，反向关系字段不影响既有查询）。

- [ ] **Step 9: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/prisma
git commit -m "feat(api): add P5 schema (purchase/alerts/notifications)"
```

---

## Task 2: shared — 新增 P5 类型

**Files:**
- Modify: `packages/shared/src/api-types.ts`

- [ ] **Step 1: 追加采购 / 预警 / 通知类型**

在 `packages/shared/src/api-types.ts` 末尾（`ControlledLedgerSnapshotSummary` 之后）追加：

```ts
export type PurchaseRequestStatus = 'PENDING' | 'MERGED' | 'CANCELLED';
export type PurchaseBatchStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'CANCELLED';

export type NotificationType =
  | 'ALERT_EXPIRING'
  | 'ALERT_LOW_STOCK'
  | 'ALERT_RECONCILE'
  | 'PURCHASE_APPROVED'
  | 'PURCHASE_REJECTED'
  | 'PURCHASE_RECEIVED';

export interface PurchaseRequestSummary {
  id: string;
  applicantId: string;
  labId: string;
  reagentId: string;
  quantity: string;
  unit: string;
  reason: string;
  status: PurchaseRequestStatus;
  batchId?: string | null;
  createdAt: string;
}

export interface PurchaseBatchSummary {
  id: string;
  labId: string;
  reagentId: string;
  totalQty: string;
  unit: string;
  status: PurchaseBatchStatus;
  rejectedReason?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseReceiptSummary {
  id: string;
  batchId: string;
  stockId: string;
  receivedBy: string;
  receivedAt: string;
  supplier?: string | null;
  purchasePrice?: string | null;
}

export interface LabReagentConfigSummary {
  id: string;
  labId: string;
  reagentId: string;
  safetyStock: string;
  expireWarningDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationSummary {
  id: string;
  recipientId: string;
  labId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  emailedAt?: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: 构建 shared 包**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/shared build 2>&1 | tail -5
```

Expected: 构建成功。验证 `packages/shared/dist/api-types.d.ts` 包含新类型。

- [ ] **Step 3: Commit**

```bash
cd D:/Project/0417-any-demo
git add packages/shared
git commit -m "feat(shared): add P5 purchase/alerts/notification types"
```

---

## Task 3: Notifications 模块 + Mailer stub

**Files:**
- Create: `apps/api/src/notifications/notifications.module.ts`
- Create: `apps/api/src/notifications/notifications.service.ts`
- Create: `apps/api/src/notifications/notifications.controller.ts`
- Create: `apps/api/src/notifications/mailer.service.ts`
- Create: `apps/api/src/notifications/dto/query-notifications.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/notifications.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/notifications.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { MailerService } from '../src/notifications/mailer.service';

describe('Notifications', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let mailer: MailerService;
  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    mailer = app.get(MailerService);

    await prisma.notification.deleteMany({});

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice-notif@lab.local', name: 'Alice', password: 'pass1234' });
    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice-notif@lab.local', password: 'pass1234' });
    aliceToken = aLogin.body.accessToken;
    aliceId = (await prisma.user.findUnique({ where: { email: 'alice-notif@lab.local' } }))!.id;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bob-notif@lab.local', name: 'Bob', password: 'pass1234' });
    const bLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bob-notif@lab.local', password: 'pass1234' });
    bobToken = bLogin.body.accessToken;
    bobId = (await prisma.user.findUnique({ where: { email: 'bob-notif@lab.local' } }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications returns only own items', async () => {
    await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 'low',
      body: 'low stock',
    });
    await notifications.create({
      recipientId: bobId,
      type: 'ALERT_LOW_STOCK',
      title: 'low',
      body: 'low stock',
    });
    const res = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((n: any) => n.recipientId === aliceId)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /notifications?unreadOnly=true filters read items', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_EXPIRING',
      title: 't',
      body: 'b',
    });
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    const res = await request(app.getHttpServer())
      .get('/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.every((x: any) => x.readAt === null)).toBe(true);
  });

  it('POST /notifications/:id/read marks read and 403 on other user', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_RECONCILE',
      title: 't',
      body: 'b',
    });
    const ok = await request(app.getHttpServer())
      .post(`/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(ok.status).toBe(200);
    const db = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(db?.readAt).not.toBeNull();

    const n2 = await notifications.create({
      recipientId: bobId,
      type: 'ALERT_RECONCILE',
      title: 't',
      body: 'b',
    });
    const denied = await request(app.getHttpServer())
      .post(`/notifications/${n2.id}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(denied.status).toBe(403);
  });

  it('POST /notifications/read-all marks all own unread', async () => {
    await notifications.create({ recipientId: aliceId, type: 'ALERT_LOW_STOCK', title: 'a', body: 'a' });
    await notifications.create({ recipientId: aliceId, type: 'ALERT_LOW_STOCK', title: 'b', body: 'b' });
    const res = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    const remaining = await prisma.notification.count({
      where: { recipientId: aliceId, readAt: null },
    });
    expect(remaining).toBe(0);
  });

  it('createIfAbsent dedupes same day by recipient+type+payload.reagentId', async () => {
    await prisma.notification.deleteMany({ where: { recipientId: aliceId } });
    const first = await notifications.createIfAbsent({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 't',
      body: 'b',
      payload: { reagentId: 'r1' },
    });
    const second = await notifications.createIfAbsent({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 't',
      body: 'b',
      payload: { reagentId: 'r1' },
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('mailer.send sets emailedAt on notification', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_EXPIRING',
      title: 't',
      body: 'b',
    });
    await mailer.send({ notificationId: n.id, to: 'alice-notif@lab.local', subject: 't', body: 'b' });
    const db = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(db?.emailedAt).not.toBeNull();
  });

  it('unauthenticated GET returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/notifications');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/notifications.e2e-spec.ts --forceExit 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../src/notifications/notifications.service'`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/notifications/dto/query-notifications.dto.ts`:

```ts
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryNotificationsDto {
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
```

- [ ] **Step 4: 创建 MailerService**

Create `apps/api/src/notifications/mailer.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SendArgs {
  notificationId?: string;
  to: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(args: SendArgs): Promise<void> {
    try {
      this.logger.log(
        `[mail-stub] to=${args.to} subject="${args.subject}" notif=${args.notificationId ?? '-'}`,
      );
      if (args.notificationId) {
        await this.prisma.notification.update({
          where: { id: args.notificationId },
          data: { emailedAt: new Date() },
        });
      }
    } catch (e) {
      this.logger.warn(`mailer send failed: ${(e as Error).message}`);
    }
  }
}
```

- [ ] **Step 5: 创建 NotificationsService**

Create `apps/api/src/notifications/notifications.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export interface CreateArgs {
  recipientId: string;
  labId?: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(args: CreateArgs) {
    return this.prisma.notification.create({
      data: {
        recipientId: args.recipientId,
        labId: args.labId ?? null,
        type: args.type,
        title: args.title,
        body: args.body,
        payload: (args.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async createIfAbsent(args: CreateArgs) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dedupKey =
      (args.payload?.reagentId as string | undefined) ??
      (args.payload?.stockId as string | undefined) ??
      null;

    const existing = await this.prisma.notification.findFirst({
      where: {
        recipientId: args.recipientId,
        type: args.type,
        readAt: null,
        createdAt: { gte: startOfDay },
        ...(dedupKey
          ? {
              OR: [
                { payload: { path: ['reagentId'], equals: dedupKey } },
                { payload: { path: ['stockId'], equals: dedupKey } },
              ],
            }
          : {}),
      },
    });
    if (existing) return null;
    return this.create(args);
  }

  async listMine(actorId: string, q: QueryNotificationsDto) {
    const where: Prisma.NotificationWhereInput = { recipientId: actorId };
    if (q.unreadOnly === 'true') where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
    });
  }

  async markRead(id: string, actorId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('notification not found');
    if (n.recipientId !== actorId) throw new ForbiddenException('forbidden');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(actorId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: actorId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
```

- [ ] **Step 6: 创建 NotificationsController**

Create `apps/api/src/notifications/notifications.controller.ts`:

```ts
import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@Query() q: QueryNotificationsDto, @CurrentUser() user: any) {
    return this.svc.listMine(user.sub, q);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(id, user.sub);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: any) {
    return this.svc.markAllRead(user.sub);
  }
}
```

- [ ] **Step 7: 创建 NotificationsModule**

Create `apps/api/src/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MailerService } from './mailer.service';

@Module({
  providers: [NotificationsService, MailerService],
  controllers: [NotificationsController],
  exports: [NotificationsService, MailerService],
})
export class NotificationsModule {}
```

- [ ] **Step 8: 挂载到 AppModule**

Modify `apps/api/src/app.module.ts` — 在 `import { LedgerModule }` 下加：

```ts
import { NotificationsModule } from './notifications/notifications.module';
```

并在 `imports: [...]` 末尾追加 `NotificationsModule,`。

- [ ] **Step 9: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/notifications.e2e-spec.ts --forceExit 2>&1 | tail -20
```

Expected: PASS — 7 tests 全绿。

- [ ] **Step 10: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/notifications apps/api/src/app.module.ts apps/api/test/notifications.e2e-spec.ts
git commit -m "feat(api): add notifications module with mailer stub"
```

---

## Task 4: Purchases — 提交 / 列表 / 取消

**Files:**
- Create: `apps/api/src/purchases/purchases.module.ts`
- Create: `apps/api/src/purchases/purchases.service.ts`
- Create: `apps/api/src/purchases/purchases.controller.ts`
- Create: `apps/api/src/purchases/dto/create-purchase.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/purchases.e2e-spec.ts`

- [ ] **Step 1: 写测试骨架 + CRUD 用例**

Create `apps/api/test/purchases.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Purchases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let labHeadToken: string;
  let labHeadId: string;
  let reagentAdminToken: string;
  let reagentAdminId: string;
  let plainToken: string;
  let plainId: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.purchaseReceipt.deleteMany({});
    await prisma.purchaseApproval.deleteMany({});
    await prisma.purchaseRequest.deleteMany({});
    await prisma.purchaseBatch.deleteMany({});

    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = aLogin.body.accessToken;

    async function registerAndLogin(email: string, name: string) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, name, password: 'pass1234' });
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'pass1234' });
      const u = await prisma.user.findUnique({ where: { email } });
      return { token: r.body.accessToken as string, id: u!.id };
    }

    const lh = await registerAndLogin('lh-p5@lab.local', 'LabHead');
    labHeadToken = lh.token;
    labHeadId = lh.id;
    await prisma.user.update({
      where: { id: labHeadId },
      data: { labId: 'lab-default' },
    });
    const lhRole = await prisma.role.findUnique({ where: { code: 'LAB_HEAD' } });
    await prisma.userRole.create({
      data: { userId: labHeadId, roleId: lhRole!.id },
    });

    const ra = await registerAndLogin('ra-p5@lab.local', 'ReagentAdmin');
    reagentAdminToken = ra.token;
    reagentAdminId = ra.id;
    await prisma.user.update({
      where: { id: reagentAdminId },
      data: { labId: 'lab-default' },
    });
    const raRole = await prisma.role.findUnique({ where: { code: 'REAGENT_ADMIN' } });
    await prisma.userRole.create({
      data: { userId: reagentAdminId, roleId: raRole!.id },
    });

    const pl = await registerAndLogin('plain-p5@lab.local', 'Plain');
    plainToken = pl.token;
    plainId = pl.id;
    await prisma.user.update({
      where: { id: plainId },
      data: { labId: 'lab-default' },
    });

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-p5' },
      update: {},
      create: { id: 'reagent-p5', name: 'P5Reagent', category: '普通' },
    });
    reagentId = reagent.id;

    // 重新 login 以带上新角色
    const lhRe = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-p5@lab.local', password: 'pass1234' });
    labHeadToken = lhRe.body.accessToken;
    const raRe = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ra-p5@lab.local', password: 'pass1234' });
    reagentAdminToken = raRe.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /purchases', () => {
    it('creates a PurchaseRequest as plain user', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '500', unit: 'mL', reason: '实验需要' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.applicantId).toBe(plainId);
      expect(res.body.labId).toBe('lab-default');
    });

    it('rejects when quantity is non-positive', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '0', unit: 'mL', reason: '测试' });
      expect(res.status).toBe(400);
    });

    it('rejects when user has no lab', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'nolab-p5@lab.local', name: 'NoLab', password: 'pass1234' });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nolab-p5@lab.local', password: 'pass1234' });
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ reagentId, quantity: '1', unit: 'mL', reason: 't' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /purchases', () => {
    it('GET /purchases/mine returns own', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases/mine')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((p: any) => p.applicantId === plainId)).toBe(true);
    });

    it('GET /purchases returns lab list for REAGENT_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${reagentAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((p: any) => p.labId === 'lab-default')).toBe(true);
    });

    it('GET /purchases forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /purchases/:id/cancel', () => {
    it('applicant cancels own PENDING', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'cancel test' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(200);
      const db = await prisma.purchaseRequest.findUnique({ where: { id } });
      expect(db?.status).toBe('CANCELLED');
    });

    it('cannot cancel MERGED', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'merge then cancel' });
      const id = create.body.id;
      await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'MERGED' },
      });
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(409);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: FAIL — `Cannot POST /purchases`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/purchases/dto/create-purchase.dto.ts`:

```ts
import { IsDecimal, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  reagentId!: string;

  @IsDecimal({ decimal_digits: '0,3' })
  quantity!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  unit!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
```

- [ ] **Step 4: 创建 PurchasesService**

Create `apps/api/src/purchases/purchases.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');
    const reagent = await this.prisma.reagent.findUnique({ where: { id: dto.reagentId } });
    if (!reagent) throw new NotFoundException('reagent not found');
    if (Number(dto.quantity) <= 0)
      throw new BadRequestException('quantity must be positive');
    return this.prisma.purchaseRequest.create({
      data: {
        applicantId: actor.sub,
        labId: user.labId,
        reagentId: dto.reagentId,
        quantity: dto.quantity,
        unit: dto.unit,
        reason: dto.reason,
      },
    });
  }

  async listMine(actor: ActorContext) {
    return this.prisma.purchaseRequest.findMany({
      where: { applicantId: actor.sub },
      include: { reagent: true, batch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLab(actor: ActorContext, labId?: string) {
    const where: Prisma.PurchaseRequestWhereInput = {};
    if (actor.roles.includes('SYS_ADMIN')) {
      if (labId) where.labId = labId;
    } else {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (!u?.labId) throw new ForbiddenException('user has no lab');
      where.labId = u.labId;
    }
    return this.prisma.purchaseRequest.findMany({
      where,
      include: {
        reagent: true,
        applicant: { select: { id: true, name: true, email: true } },
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string, actor: ActorContext) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) throw new NotFoundException('purchase request not found');
    if (pr.applicantId !== actor.sub && !actor.roles.includes('SYS_ADMIN'))
      throw new ForbiddenException('forbidden');
    if (pr.status !== 'PENDING')
      throw new ConflictException('request not pending');
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
```

- [ ] **Step 5: 创建 Controller**

Create `apps/api/src/purchases/purchases.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Post()
  @Audit({ action: 'PURCHASE_CREATE', entityType: 'PurchaseRequest' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user);
  }

  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.svc.listMine(user);
  }

  @Get()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  list(@Query('labId') labId: string | undefined, @CurrentUser() user: any) {
    return this.svc.listLab(user, labId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'PURCHASE_CANCEL', entityType: 'PurchaseRequest' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.cancel(id, user);
  }
}
```

- [ ] **Step 6: 创建 Module**

Create `apps/api/src/purchases/purchases.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';

@Module({
  imports: [NotificationsModule],
  providers: [PurchasesService],
  controllers: [PurchasesController],
  exports: [PurchasesService],
})
export class PurchasesModule {}
```

- [ ] **Step 7: 挂载到 AppModule**

Modify `apps/api/src/app.module.ts` — 加 import `PurchasesModule` 并添加到 `imports`。

- [ ] **Step 8: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 8 tests 全绿。

- [ ] **Step 9: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/purchases apps/api/src/app.module.ts apps/api/test/purchases.e2e-spec.ts
git commit -m "feat(api): add purchase request CRUD"
```

---

## Task 5: Purchases — 批次合并（BatchesService）

**Files:**
- Create: `apps/api/src/purchases/batches.service.ts`
- Create: `apps/api/src/purchases/dto/merge-batch.dto.ts`
- Modify: `apps/api/src/purchases/purchases.controller.ts`
- Modify: `apps/api/src/purchases/purchases.module.ts`
- Modify: `apps/api/test/purchases.e2e-spec.ts`

- [ ] **Step 1: 追加合并测试**

在 `apps/api/test/purchases.e2e-spec.ts` 的 `afterAll` 之前追加新 describe：

```ts
  describe('POST /purchases/batches (merge)', () => {
    async function createPR(qty: string) {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: qty, unit: 'mL', reason: 'merge' });
      return res.body.id as string;
    }

    it('rejects empty requestIds', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [] });
      expect(res.status).toBe(400);
    });

    it('forbidden for LAB_HEAD', async () => {
      const id = await createPR('1');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ requestIds: [id] });
      expect(res.status).toBe(403);
    });

    it('409 when any request not PENDING', async () => {
      const id = await createPR('1');
      await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [id] });
      expect(res.status).toBe(409);
    });

    it('400 when reagent differs', async () => {
      const r2 = await prisma.reagent.upsert({
        where: { id: 'reagent-p5-b' },
        update: {},
        create: { id: 'reagent-p5-b', name: 'P5B', category: '普通' },
      });
      const a = await createPR('1');
      const bRes = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId: r2.id, quantity: '1', unit: 'mL', reason: 't' });
      const b = bRes.body.id;
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expect(res.status).toBe(400);
    });

    it('merges two PENDING requests into a batch', async () => {
      const a = await createPR('100');
      const b = await createPR('200');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(Number(res.body.totalQty)).toBe(300);
      const [dbA, dbB] = await Promise.all([
        prisma.purchaseRequest.findUnique({ where: { id: a } }),
        prisma.purchaseRequest.findUnique({ where: { id: b } }),
      ]);
      expect(dbA?.status).toBe('MERGED');
      expect(dbA?.batchId).toBe(res.body.id);
      expect(dbB?.batchId).toBe(res.body.id);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts -t 'merge' --forceExit 2>&1 | tail -15
```

Expected: FAIL — `Cannot POST /purchases/batches`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/purchases/dto/merge-batch.dto.ts`:

```ts
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class MergeBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  requestIds!: string[];
}
```

- [ ] **Step 4: 创建 BatchesService（仅含 merge）**

Create `apps/api/src/purchases/batches.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MergeBatchDto } from './dto/merge-batch.dto';
import type { ActorContext } from './purchases.service';

@Injectable()
export class BatchesService {
  constructor(private prisma: PrismaService) {}

  async merge(dto: MergeBatchDto, actor: ActorContext) {
    const items = await this.prisma.purchaseRequest.findMany({
      where: { id: { in: dto.requestIds } },
    });
    if (items.length !== dto.requestIds.length)
      throw new NotFoundException('purchase request not found');
    const labs = new Set(items.map((i) => i.labId));
    const reagents = new Set(items.map((i) => i.reagentId));
    const units = new Set(items.map((i) => i.unit));
    if (labs.size > 1 || reagents.size > 1 || units.size > 1)
      throw new BadRequestException('merge requires same lab/reagent/unit');
    if (items.some((i) => i.status !== 'PENDING'))
      throw new ConflictException('request not pending');

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (!actorUser?.labId || actorUser.labId !== items[0].labId)
      throw new ForbiddenException('forbidden');

    const total = items.reduce((s, i) => s + Number(i.quantity), 0);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.purchaseBatch.create({
        data: {
          labId: items[0].labId,
          reagentId: items[0].reagentId,
          totalQty: total.toString(),
          unit: items[0].unit,
          createdBy: actor.sub,
        },
      });
      await tx.purchaseRequest.updateMany({
        where: { id: { in: dto.requestIds } },
        data: { status: 'MERGED', batchId: batch.id },
      });
      return batch;
    });
  }
}
```

- [ ] **Step 5: 更新 Module + Controller**

Modify `apps/api/src/purchases/purchases.module.ts` — 在 `providers` 加 `BatchesService`。

Modify `apps/api/src/purchases/purchases.controller.ts` — 加 import 与新端点：

```ts
import { BatchesService } from './batches.service';
import { MergeBatchDto } from './dto/merge-batch.dto';
```

在 `constructor` 增加 `private readonly batches: BatchesService`，并在 class 内追加：

```ts
  @Post('batches')
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_CREATE', entityType: 'PurchaseBatch' })
  merge(@Body() dto: MergeBatchDto, @CurrentUser() user: any) {
    return this.batches.merge(dto, user);
  }
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 13 tests 全绿（原 8 + 新 5）。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/purchases apps/api/test/purchases.e2e-spec.ts
git commit -m "feat(api): merge purchase requests into batch"
```

---

## Task 6: Purchases — 批次审批（APPROVE / REJECT 回滚）

**Files:**
- Modify: `apps/api/src/purchases/batches.service.ts`
- Create: `apps/api/src/purchases/dto/approve-batch.dto.ts`
- Modify: `apps/api/src/purchases/purchases.controller.ts`
- Modify: `apps/api/test/purchases.e2e-spec.ts`

- [ ] **Step 1: 追加审批测试**

在 `apps/api/test/purchases.e2e-spec.ts` 的合并 describe 后追加：

```ts
  describe('POST /purchases/batches/:id/approve', () => {
    async function newBatch() {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'x' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.id] });
      return { batchId: m.body.id, requestId: r.body.id };
    }

    it('APPROVE flips batch status and notifies REAGENT_ADMIN', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: reagentAdminId } });
      const { batchId } = await newBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE', comment: 'ok' });
      expect(res.status).toBe(200);
      const db = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(db?.status).toBe('APPROVED');
      const notif = await prisma.notification.findFirst({
        where: { recipientId: reagentAdminId, type: 'PURCHASE_APPROVED' },
      });
      expect(notif).not.toBeNull();
    });

    it('REJECT rolls items back to PENDING and notifies applicants', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: plainId } });
      const { batchId, requestId } = await newBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'REJECT', comment: '预算不足' });
      expect(res.status).toBe(200);
      const b = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(b?.status).toBe('REJECTED');
      expect(b?.rejectedReason).toBe('预算不足');
      const pr = await prisma.purchaseRequest.findUnique({ where: { id: requestId } });
      expect(pr?.status).toBe('PENDING');
      expect(pr?.batchId).toBeNull();
      const notif = await prisma.notification.findFirst({
        where: { recipientId: plainId, type: 'PURCHASE_REJECTED' },
      });
      expect(notif).not.toBeNull();
    });

    it('409 when batch not PENDING', async () => {
      const { batchId } = await newBatch();
      await prisma.purchaseBatch.update({
        where: { id: batchId },
        data: { status: 'APPROVED' },
      });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      expect(res.status).toBe(409);
    });

    it('forbidden for non-lab LAB_HEAD', async () => {
      const { batchId } = await newBatch();
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'other-lab' },
      });
      const newLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'lh-p5@lab.local', password: 'pass1234' });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${newLogin.body.accessToken}`)
        .send({ action: 'APPROVE' });
      expect(res.status).toBe(403);
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'lab-default' },
      });
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts -t 'approve' --forceExit 2>&1 | tail -15
```

Expected: FAIL — `Cannot POST /purchases/batches/*/approve`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/purchases/dto/approve-batch.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalAction } from '@prisma/client';

export class ApproveBatchDto {
  @IsEnum(ApprovalAction)
  action!: ApprovalAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
```

- [ ] **Step 4: 扩展 BatchesService.approve**

在 `apps/api/src/purchases/batches.service.ts` 顶部 import：

```ts
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../notifications/mailer.service';
import { ApproveBatchDto } from './dto/approve-batch.dto';
```

在 `constructor` 追加参数：

```ts
constructor(
  private prisma: PrismaService,
  private notifications: NotificationsService,
  private mailer: MailerService,
) {}
```

在类末尾追加：

```ts
  async approve(batchId: string, dto: ApproveBatchDto, actor: ActorContext) {
    const batch = await this.prisma.purchaseBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException('batch not found');
    if (batch.status !== 'PENDING')
      throw new ConflictException('batch not pending');

    if (!actor.roles.includes('SYS_ADMIN')) {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (u?.labId !== batch.labId)
        throw new ForbiddenException('forbidden');
    }

    const nextStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseApproval.create({
        data: {
          batchId,
          approverId: actor.sub,
          action: dto.action,
          comment: dto.comment,
        },
      });
      const b = await tx.purchaseBatch.update({
        where: { id: batchId },
        data: {
          status: nextStatus,
          rejectedReason: dto.action === 'REJECT' ? dto.comment : null,
        },
      });
      if (dto.action === 'REJECT') {
        await tx.purchaseRequest.updateMany({
          where: { batchId },
          data: { status: 'PENDING', batchId: null },
        });
      }
      return b;
    });

    // 事务后通知
    if (dto.action === 'APPROVE') {
      const recipients = await this.prisma.user.findMany({
        where: {
          labId: batch.labId,
          roles: { some: { role: { code: 'REAGENT_ADMIN' } } },
        },
      });
      for (const r of recipients) {
        const n = await this.notifications.create({
          recipientId: r.id,
          labId: batch.labId,
          type: 'PURCHASE_APPROVED',
          title: '采购批次已审批',
          body: `批次 ${batchId} 已通过，可以下单入库`,
          payload: { batchId, reagentId: batch.reagentId },
        });
        await this.mailer.send({
          notificationId: n.id,
          to: r.email,
          subject: '采购批次已审批',
          body: n.body,
        });
      }
    } else {
      const applicantIds = Array.from(new Set(batch.items.map((i) => i.applicantId)));
      for (const aid of applicantIds) {
        const u = await this.prisma.user.findUnique({ where: { id: aid } });
        if (!u) continue;
        const n = await this.notifications.create({
          recipientId: aid,
          labId: batch.labId,
          type: 'PURCHASE_REJECTED',
          title: '采购批次被驳回',
          body: `原因：${dto.comment ?? '无'}`,
          payload: { batchId, reagentId: batch.reagentId },
        });
        await this.mailer.send({
          notificationId: n.id,
          to: u.email,
          subject: '采购批次被驳回',
          body: n.body,
        });
      }
    }
    return updated;
  }
```

- [ ] **Step 5: 添加路由**

在 `apps/api/src/purchases/purchases.controller.ts` 追加：

```ts
import { ApproveBatchDto } from './dto/approve-batch.dto';
```

并添加：

```ts
  @Post('batches/:id/approve')
  @HttpCode(200)
  @Roles('LAB_HEAD', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_APPROVE', entityType: 'PurchaseBatch' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.batches.approve(id, dto, user);
  }
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 17 tests 全绿。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/purchases apps/api/test/purchases.e2e-spec.ts
git commit -m "feat(api): approve/reject purchase batch with notifications"
```

---

## Task 7: Purchases — 入库（PurchaseReceipt + 新 ReagentStock）

**Files:**
- Modify: `apps/api/src/purchases/batches.service.ts`
- Create: `apps/api/src/purchases/dto/receipt-batch.dto.ts`
- Modify: `apps/api/src/purchases/purchases.controller.ts`
- Modify: `apps/api/test/purchases.e2e-spec.ts`

- [ ] **Step 1: 追加入库测试**

在 approve describe 之后追加：

```ts
  describe('POST /purchases/batches/:id/receipt', () => {
    async function approvedBatch() {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '50', unit: 'mL', reason: 'receive' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.id] });
      await request(app.getHttpServer())
        .post(`/purchases/batches/${m.body.id}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      return m.body.id as string;
    }

    it('creates ReagentStock and Receipt, notifies applicants', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: plainId } });
      const batchId = await approvedBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({
          actualQty: '50',
          batchNo: 'P5RCV-001',
          supplier: 'ACME',
          purchasePrice: '123.45',
          location: 'A-01',
        });
      expect(res.status).toBe(201);
      expect(res.body.stockId).toBeDefined();

      const stock = await prisma.reagentStock.findUnique({
        where: { id: res.body.stockId },
      });
      expect(stock?.batchNo).toBe('P5RCV-001');
      expect(Number(stock?.initialQty)).toBe(50);
      expect(Number(stock?.currentQty)).toBe(50);

      const b = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(b?.status).toBe('RECEIVED');

      const notif = await prisma.notification.findFirst({
        where: { recipientId: plainId, type: 'PURCHASE_RECEIVED' },
      });
      expect(notif).not.toBeNull();
    });

    it('409 on second receipt', async () => {
      const batchId = await approvedBatch();
      await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '1' });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '1' });
      expect(res.status).toBe(409);
    });

    it('409 when batch not APPROVED', async () => {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 't' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.id] });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${m.body.id}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '10' });
      expect(res.status).toBe(409);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts -t 'receipt' --forceExit 2>&1 | tail -15
```

Expected: FAIL — `Cannot POST /purchases/batches/*/receipt`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/purchases/dto/receipt-batch.dto.ts`:

```ts
import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReceiptBatchDto {
  @IsDecimal({ decimal_digits: '0,3' })
  actualQty!: string;

  @IsOptional() @IsString() @MaxLength(64) batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsOptional() @IsString() @MaxLength(128) location?: string;
  @IsOptional() @IsString() @MaxLength(128) supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
```

- [ ] **Step 4: 扩展 BatchesService.receive**

在 `apps/api/src/purchases/batches.service.ts` 顶部 import：

```ts
import { ReceiptBatchDto } from './dto/receipt-batch.dto';
```

在类末尾追加：

```ts
  async receive(batchId: string, dto: ReceiptBatchDto, actor: ActorContext) {
    const batch = await this.prisma.purchaseBatch.findUnique({
      where: { id: batchId },
      include: { items: true, receipt: true },
    });
    if (!batch) throw new NotFoundException('batch not found');
    if (batch.receipt) throw new ConflictException('receipt already recorded');
    if (batch.status !== 'APPROVED')
      throw new ConflictException('batch not approved');

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (actorUser?.labId !== batch.labId && !actor.roles.includes('SYS_ADMIN'))
      throw new ForbiddenException('forbidden');

    const receipt = await this.prisma.$transaction(async (tx) => {
      const stock = await tx.reagentStock.create({
        data: {
          reagentId: batch.reagentId,
          labId: batch.labId,
          batchNo: dto.batchNo,
          mfgDate: dto.mfgDate ? new Date(dto.mfgDate) : null,
          expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
          initialQty: dto.actualQty,
          currentQty: dto.actualQty,
          unit: batch.unit,
          location: dto.location,
          supplier: dto.supplier,
          purchasePrice: dto.purchasePrice,
        },
      });
      const r = await tx.purchaseReceipt.create({
        data: {
          batchId,
          stockId: stock.id,
          receivedBy: actor.sub,
          supplier: dto.supplier,
          purchasePrice: dto.purchasePrice,
        },
      });
      await tx.purchaseBatch.update({
        where: { id: batchId },
        data: { status: 'RECEIVED' },
      });
      return r;
    });

    // 通知 applicants（去重）
    const applicantIds = Array.from(new Set(batch.items.map((i) => i.applicantId)));
    for (const aid of applicantIds) {
      const u = await this.prisma.user.findUnique({ where: { id: aid } });
      if (!u) continue;
      const n = await this.notifications.create({
        recipientId: aid,
        labId: batch.labId,
        type: 'PURCHASE_RECEIVED',
        title: '采购试剂已入库',
        body: `批次 ${batchId} 已入库，可申请领用`,
        payload: { batchId, stockId: receipt.stockId, reagentId: batch.reagentId },
      });
      await this.mailer.send({
        notificationId: n.id,
        to: u.email,
        subject: '采购试剂已入库',
        body: n.body,
      });
    }

    return receipt;
  }
```

- [ ] **Step 5: 添加路由**

在 `apps/api/src/purchases/purchases.controller.ts` 追加：

```ts
import { ReceiptBatchDto } from './dto/receipt-batch.dto';
```

并在 class 内追加：

```ts
  @Post('batches/:id/receipt')
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_RECEIVE', entityType: 'PurchaseReceipt' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiptBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.batches.receive(id, dto, user);
  }
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/purchases.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 20 tests 全绿（原 17 + 新 3）。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/purchases apps/api/test/purchases.e2e-spec.ts
git commit -m "feat(api): receive purchase batch creates new stock"
```

---

## Task 8: Alerts — LabReagentConfig CRUD

**Files:**
- Create: `apps/api/src/alerts/alerts.module.ts`
- Create: `apps/api/src/alerts/config.service.ts`
- Create: `apps/api/src/alerts/alerts.controller.ts`
- Create: `apps/api/src/alerts/dto/upsert-config.dto.ts`
- Create: `apps/api/src/alerts/dto/query-config.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/alerts.e2e-spec.ts`

- [ ] **Step 1: 写测试骨架 + config CRUD 用例**

Create `apps/api/test/alerts.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Alerts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let labHeadToken: string;
  let labHeadId: string;
  let plainToken: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.labReagentConfig.deleteMany({});

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'lh-alerts@lab.local', name: 'LH', password: 'pass1234' });
    let r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-alerts@lab.local', password: 'pass1234' });
    labHeadToken = r.body.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'lh-alerts@lab.local' } });
    labHeadId = u!.id;
    await prisma.user.update({ where: { id: labHeadId }, data: { labId: 'lab-default' } });
    const role = await prisma.role.findUnique({ where: { code: 'LAB_HEAD' } });
    await prisma.userRole.create({ data: { userId: labHeadId, roleId: role!.id } });
    r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-alerts@lab.local', password: 'pass1234' });
    labHeadToken = r.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'plain-alerts@lab.local', name: 'Plain', password: 'pass1234' });
    const pl = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-alerts@lab.local', password: 'pass1234' });
    plainToken = pl.body.accessToken;

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-alerts' },
      update: {},
      create: { id: 'reagent-alerts', name: 'AlertReagent', category: '普通' },
    });
    reagentId = reagent.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('LabReagentConfig CRUD', () => {
    it('POST /lab-reagent-configs creates', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '100', expireWarningDays: 30 });
      expect(res.status).toBe(201);
      expect(res.body.safetyStock).toBe('100');
    });

    it('409 on duplicate (labId, reagentId)', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '200' });
      expect(res.status).toBe(409);
    });

    it('400 on negative safetyStock', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId: 'reagent-alerts', safetyStock: '-1' });
      expect(res.status).toBe(400);
    });

    it('forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '1' });
      expect(res.status).toBe(403);
    });

    it('GET /lab-reagent-configs returns lab list', async () => {
      const res = await request(app.getHttpServer())
        .get('/lab-reagent-configs?labId=lab-default')
        .set('Authorization', `Bearer ${labHeadToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/alerts.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: FAIL — `Cannot POST /lab-reagent-configs`。

- [ ] **Step 3: 创建 DTO**

Create `apps/api/src/alerts/dto/upsert-config.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Min, Matches } from 'class-validator';

export class UpsertConfigDto {
  @IsString()
  labId!: string;

  @IsString()
  reagentId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/, { message: 'safetyStock must be non-negative decimal' })
  safetyStock!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expireWarningDays?: number;
}
```

Create `apps/api/src/alerts/dto/query-config.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class QueryConfigDto {
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsString() reagentId?: string;
}
```

- [ ] **Step 4: 创建 ConfigService**

Create `apps/api/src/alerts/config.service.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { QueryConfigDto } from './dto/query-config.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  async create(dto: UpsertConfigDto, actor: ActorContext) {
    await this.ensureLabAccess(dto.labId, actor);
    try {
      return await this.prisma.labReagentConfig.create({
        data: {
          labId: dto.labId,
          reagentId: dto.reagentId,
          safetyStock: dto.safetyStock,
          expireWarningDays: dto.expireWarningDays ?? 30,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('config exists');
      throw e;
    }
  }

  async update(id: string, dto: Partial<UpsertConfigDto>, actor: ActorContext) {
    const cfg = await this.prisma.labReagentConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException('config not found');
    await this.ensureLabAccess(cfg.labId, actor);
    return this.prisma.labReagentConfig.update({
      where: { id },
      data: {
        safetyStock: dto.safetyStock ?? undefined,
        expireWarningDays: dto.expireWarningDays ?? undefined,
      },
    });
  }

  async list(q: QueryConfigDto, actor: ActorContext) {
    const where: Prisma.LabReagentConfigWhereInput = {};
    if (q.reagentId) where.reagentId = q.reagentId;
    if (actor.roles.includes('SYS_ADMIN')) {
      if (q.labId) where.labId = q.labId;
    } else {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (!u?.labId) throw new ForbiddenException('user has no lab');
      where.labId = u.labId;
    }
    return this.prisma.labReagentConfig.findMany({
      where,
      include: { reagent: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, actor: ActorContext) {
    const cfg = await this.prisma.labReagentConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException('config not found');
    await this.ensureLabAccess(cfg.labId, actor);
    return this.prisma.labReagentConfig.delete({ where: { id } });
  }

  private async ensureLabAccess(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (u?.labId !== labId) throw new ForbiddenException('forbidden');
  }
}
```

- [ ] **Step 5: 创建 AlertsController（仅 config 路由，runDaily 下一步）**

Create `apps/api/src/alerts/alerts.controller.ts`:

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
import { ConfigService } from './config.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { QueryConfigDto } from './dto/query-config.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('lab-reagent-configs')
export class AlertsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  create(@Body() dto: UpsertConfigDto, @CurrentUser() user: any) {
    return this.config.create(dto, user);
  }

  @Get()
  list(@Query() q: QueryConfigDto, @CurrentUser() user: any) {
    return this.config.list(q, user);
  }

  @Patch(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertConfigDto>,
    @CurrentUser() user: any,
  ) {
    return this.config.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_DELETE', entityType: 'LabReagentConfig' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.config.remove(id, user);
  }
}
```

- [ ] **Step 6: 创建 Module**

Create `apps/api/src/alerts/alerts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigService } from './config.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigService],
  controllers: [AlertsController],
  exports: [ConfigService],
})
export class AlertsModule {}
```

- [ ] **Step 7: 挂载到 AppModule**

Modify `apps/api/src/app.module.ts` — 加 `AlertsModule` import 与 `imports` 数组。

- [ ] **Step 8: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/alerts.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 5 tests 全绿。

- [ ] **Step 9: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/alerts apps/api/src/app.module.ts apps/api/test/alerts.e2e-spec.ts
git commit -m "feat(api): add LabReagentConfig CRUD"
```

---

## Task 9: Alerts — runDaily + Scheduler

**Files:**
- Create: `apps/api/src/alerts/alerts.service.ts`
- Create: `apps/api/src/alerts/alerts.scheduler.ts`
- Modify: `apps/api/src/alerts/alerts.module.ts`
- Modify: `apps/api/test/alerts.e2e-spec.ts`

- [ ] **Step 1: 追加 runDaily 测试**

在 `apps/api/test/alerts.e2e-spec.ts` `afterAll` 之前追加：

```ts
  describe('AlertsService.runDaily', () => {
    it('creates notifications for expiring + low stock + reconcile', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      // 准备：安全阈值 100；当前库存 50 → 低库存
      await prisma.labReagentConfig.upsert({
        where: {
          labId_reagentId: { labId: 'lab-default', reagentId },
        },
        update: { safetyStock: '100' },
        create: { labId: 'lab-default', reagentId, safetyStock: '100' },
      });
      const nearExpire = new Date();
      nearExpire.setDate(nearExpire.getDate() + 10);
      await prisma.reagentStock.upsert({
        where: { id: 'stock-alert-low' },
        update: {
          currentQty: '50',
          initialQty: '500',
          expireDate: nearExpire,
        },
        create: {
          id: 'stock-alert-low',
          reagentId,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '50',
          unit: 'mL',
          expireDate: nearExpire,
        },
      });

      await prisma.notification.deleteMany({ where: { recipientId: labHeadId } });

      await alerts.runDaily();

      const notifs = await prisma.notification.findMany({
        where: { recipientId: labHeadId },
      });
      const types = new Set(notifs.map((n) => n.type));
      expect(types.has('ALERT_LOW_STOCK')).toBe(true);
      expect(types.has('ALERT_EXPIRING')).toBe(true);
    });

    it('second runDaily same day is idempotent', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);
      const before = await prisma.notification.count({
        where: { recipientId: labHeadId, readAt: null },
      });
      await alerts.runDaily();
      const after = await prisma.notification.count({
        where: { recipientId: labHeadId, readAt: null },
      });
      expect(after).toBe(before);
    });

    it('skips lowStock when config absent but still emits expiring', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      const r2 = await prisma.reagent.upsert({
        where: { id: 'reagent-no-config' },
        update: {},
        create: { id: 'reagent-no-config', name: 'NoConfig', category: '普通' },
      });
      const nearExpire = new Date();
      nearExpire.setDate(nearExpire.getDate() + 5);
      await prisma.reagentStock.upsert({
        where: { id: 'stock-noconfig' },
        update: { expireDate: nearExpire },
        create: {
          id: 'stock-noconfig',
          reagentId: r2.id,
          labId: 'lab-default',
          initialQty: '100',
          currentQty: '100',
          unit: 'mL',
          expireDate: nearExpire,
        },
      });
      await prisma.notification.deleteMany({ where: { recipientId: labHeadId } });
      await alerts.runDaily();
      const low = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_LOW_STOCK',
          payload: { path: ['reagentId'], equals: r2.id },
        },
      });
      expect(low).toBeNull();
      const expiring = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_EXPIRING',
          payload: { path: ['reagentId'], equals: r2.id },
        },
      });
      expect(expiring).not.toBeNull();
    });

    it('reports controlled reconcile anomaly when qty mismatch', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      const ctrl = await prisma.reagent.upsert({
        where: { id: 'reagent-ctrl-alert' },
        update: {},
        create: {
          id: 'reagent-ctrl-alert',
          name: 'CtrlAlert',
          category: '管控',
          hazardLevel: 'CONTROLLED',
          controlType: 'TOXIC',
        },
      });
      // 构造量不平：initial=500, current=500 (无领用), 断言应不预警
      await prisma.reagentStock.upsert({
        where: { id: 'stock-ctrl-ok' },
        update: { initialQty: '500', currentQty: '500' },
        create: {
          id: 'stock-ctrl-ok',
          reagentId: ctrl.id,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '500',
          unit: 'mL',
        },
      });
      // 另一个库存，人为破坏：initial=500, current=100, 无领用 → 异常 400
      await prisma.reagentStock.upsert({
        where: { id: 'stock-ctrl-bad' },
        update: { initialQty: '500', currentQty: '100' },
        create: {
          id: 'stock-ctrl-bad',
          reagentId: ctrl.id,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '100',
          unit: 'mL',
        },
      });

      await prisma.notification.deleteMany({
        where: { recipientId: labHeadId, type: 'ALERT_RECONCILE' },
      });
      await alerts.runDaily();
      const rec = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_RECONCILE',
          payload: { path: ['reagentId'], equals: ctrl.id },
        },
      });
      expect(rec).not.toBeNull();
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/alerts.e2e-spec.ts -t 'runDaily' --forceExit 2>&1 | tail -15
```

Expected: FAIL — 找不到 `AlertsService`。

- [ ] **Step 3: 创建 AlertsService**

Create `apps/api/src/alerts/alerts.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../notifications/mailer.service';

const DEFAULT_EXPIRE_WARN_DAYS = 30;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mailer: MailerService,
  ) {}

  async runDaily() {
    const labs = await this.prisma.lab.findMany({ where: { deletedAt: null } });
    let total = 0;
    for (const lab of labs) {
      try {
        const found = await this.scanLab(lab.id);
        total += found;
      } catch (e) {
        this.logger.error(`alerts lab=${lab.id} error=${(e as Error).message}`);
      }
    }
    await this.prisma.auditLog.create({
      data: {
        action: 'ALERT_SCAN',
        entityType: 'Alert',
        after: { labs: labs.length, totalNotifications: total },
      },
    });
    this.logger.log(`alerts scan done labs=${labs.length} notifs=${total}`);
    return total;
  }

  private async scanLab(labId: string): Promise<number> {
    const [lowStock, expiring, reconcile] = await Promise.all([
      this.findLowStock(labId),
      this.findExpiring(labId),
      this.findReconcileAnomalies(labId),
    ]);
    const findings = [...lowStock, ...expiring, ...reconcile];
    if (findings.length === 0) return 0;

    const recipients = await this.prisma.user.findMany({
      where: {
        labId,
        roles: {
          some: { role: { code: { in: ['LAB_HEAD', 'REAGENT_ADMIN'] } } },
        },
      },
    });
    let count = 0;
    for (const f of findings) {
      for (const r of recipients) {
        const n = await this.notifications.createIfAbsent({
          recipientId: r.id,
          labId,
          type: f.type,
          title: f.title,
          body: f.body,
          payload: f.payload,
        });
        if (n) {
          count++;
          await this.mailer.send({
            notificationId: n.id,
            to: r.email,
            subject: f.title,
            body: f.body,
          });
        }
      }
    }
    return count;
  }

  private async findLowStock(labId: string) {
    const configs = await this.prisma.labReagentConfig.findMany({
      where: { labId },
      include: { reagent: true },
    });
    const out: AlertFinding[] = [];
    for (const c of configs) {
      const stocks = await this.prisma.reagentStock.findMany({
        where: { labId, reagentId: c.reagentId, deletedAt: null },
      });
      const sum = stocks.reduce((s, x) => s + Number(x.currentQty), 0);
      if (sum < Number(c.safetyStock)) {
        out.push({
          type: 'ALERT_LOW_STOCK',
          title: `库存告急：${c.reagent.name}`,
          body: `当前总量 ${sum} ${stocks[0]?.unit ?? ''}，低于安全阈值 ${c.safetyStock}`,
          payload: { reagentId: c.reagentId, labId, current: sum },
        });
      }
    }
    return out;
  }

  private async findExpiring(labId: string) {
    const configs = await this.prisma.labReagentConfig.findMany({ where: { labId } });
    const daysByReagent = new Map<string, number>();
    configs.forEach((c) => daysByReagent.set(c.reagentId, c.expireWarningDays));
    const stocks = await this.prisma.reagentStock.findMany({
      where: { labId, deletedAt: null, expireDate: { not: null } },
      include: { reagent: true },
    });
    const now = Date.now();
    const out: AlertFinding[] = [];
    for (const s of stocks) {
      const days = daysByReagent.get(s.reagentId) ?? DEFAULT_EXPIRE_WARN_DAYS;
      const diff = (s.expireDate!.getTime() - now) / 86_400_000;
      if (diff <= days && diff >= -1) {
        out.push({
          type: 'ALERT_EXPIRING',
          title: `效期预警：${s.reagent.name}`,
          body: `批次 ${s.batchNo ?? s.id} 将于 ${s.expireDate!.toISOString().slice(0, 10)} 到期`,
          payload: { reagentId: s.reagentId, stockId: s.id, labId, days },
        });
      }
    }
    return out;
  }

  private async findReconcileAnomalies(labId: string) {
    const out: AlertFinding[] = [];
    // ① 量不平
    const controlled = await this.prisma.reagent.findMany({
      where: {
        OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
      },
    });
    for (const r of controlled) {
      const stocks = await this.prisma.reagentStock.findMany({
        where: { labId, reagentId: r.id, deletedAt: null },
      });
      if (stocks.length === 0) continue;
      const initial = stocks.reduce((s, x) => s + Number(x.initialQty), 0);
      const current = stocks.reduce((s, x) => s + Number(x.currentQty), 0);
      const stockIds = stocks.map((s) => s.id);
      const issues = await this.prisma.issueRecord.findMany({
        where: { stockId: { in: stockIds } },
      });
      const issued = issues.reduce((s, x) => s + Number(x.actualQty), 0);
      if (Math.abs(initial - issued - current) > 0.001) {
        out.push({
          type: 'ALERT_RECONCILE',
          title: `管控对账异常：${r.name}`,
          body: `量不平 initial=${initial} issued=${issued} current=${current}`,
          payload: { reagentId: r.id, labId, kind: 'QTY' },
        });
      }
    }
    // ② 见证不合规（本月）
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const badIssues = await this.prisma.issueRecord.findMany({
      where: {
        createdAt: { gte: monthStart },
        request: {
          labId,
          reagent: {
            OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
          },
        },
      },
      include: { request: { include: { reagent: true } } },
    });
    for (const i of badIssues) {
      const bad =
        i.witnessId == null ||
        i.witnessId === i.issuerId ||
        !i.signatureDataUrl;
      if (bad) {
        out.push({
          type: 'ALERT_RECONCILE',
          title: `管控见证缺失：${i.request.reagent.name}`,
          body: `发放记录 ${i.id} 见证/签名不合规`,
          payload: { reagentId: i.request.reagentId, issueId: i.id, labId, kind: 'WITNESS' },
        });
      }
    }
    return out;
  }
}

interface AlertFinding {
  type: 'ALERT_LOW_STOCK' | 'ALERT_EXPIRING' | 'ALERT_RECONCILE';
  title: string;
  body: string;
  payload: Record<string, unknown>;
}
```

- [ ] **Step 4: 创建 Scheduler**

Create `apps/api/src/alerts/alerts.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(private readonly alerts: AlertsService) {}

  @Cron('58 7 * * *')
  async daily() {
    const n = await this.alerts.runDaily();
    this.logger.log(`daily alerts scheduler done, notifs=${n}`);
  }
}
```

- [ ] **Step 5: 更新 Module**

Modify `apps/api/src/alerts/alerts.module.ts` — 在 `providers` 里加 `AlertsService, AlertsScheduler` 并导出 `AlertsService`：

```ts
import { AlertsService } from './alerts.service';
import { AlertsScheduler } from './alerts.scheduler';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigService, AlertsService, AlertsScheduler],
  controllers: [AlertsController],
  exports: [ConfigService, AlertsService],
})
export class AlertsModule {}
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json test/alerts.e2e-spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — 9 tests 全绿（5 config + 4 runDaily）。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/src/alerts apps/api/test/alerts.e2e-spec.ts
git commit -m "feat(api): daily alerts scan with cron scheduler"
```

---

## Task 10: Web — NotificationBell 全局组件

**Files:**
- Create: `apps/web/src/components/NotificationBell.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: 查 layout 现状**

Run:
```bash
cat apps/web/src/app/layout.tsx
```

预期看到全局 `<html><body>` wrapper。铃铛将放在 body 里固定右上角。

- [ ] **Step 2: 创建 NotificationBell**

Create `apps/web/src/components/NotificationBell.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { NotificationSummary } from '@app/shared';

export function NotificationBell() {
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const res = await api<NotificationSummary[]>('/notifications?unreadOnly=true');
      setItems(res);
    } catch {
      // 未登录时 401 —— 忽略
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' });
    setItems([]);
  }

  async function markOne(id: string) {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    setItems((s) => s.filter((n) => n.id !== id));
  }

  return (
    <div className="fixed top-2 right-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative px-3 py-1 bg-white border rounded shadow"
      >
        🔔
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white border rounded shadow-lg max-h-96 overflow-auto">
          <div className="flex justify-between p-2 border-b">
            <span className="font-semibold">通知</span>
            <button className="text-blue-600 text-sm" onClick={markAll}>
              全部已读
            </button>
          </div>
          {items.length === 0 && (
            <div className="p-3 text-gray-500 text-sm">无新消息</div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className="p-2 border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => markOne(n.id)}
            >
              <div className="font-medium text-sm">{n.title}</div>
              <div className="text-xs text-gray-600">{n.body}</div>
              <div className="text-xs text-gray-400">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 挂载到 layout.tsx**

Modify `apps/web/src/app/layout.tsx` — 在 `<body>` 内 `{children}` 之前或之后插入：

```tsx
import { NotificationBell } from '@/components/NotificationBell';
// ...
<body>
  <NotificationBell />
  {children}
</body>
```

- [ ] **Step 4: 类型检查**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -20
```

Expected: 构建通过。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web/src/components/NotificationBell.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): add global notification bell with polling"
```

---

## Task 11: Web — 采购相关三个页面

**Files:**
- Create: `apps/web/src/app/my/purchases/page.tsx`
- Create: `apps/web/src/app/admin/purchases/page.tsx`
- Create: `apps/web/src/app/approvals/purchases/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: /my/purchases 页面**

Create `apps/web/src/app/my/purchases/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { PurchaseRequestSummary, ReagentSummary } from '@app/shared';

export default function MyPurchasesPage() {
  const [items, setItems] = useState<PurchaseRequestSummary[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [form, setForm] = useState({ reagentId: '', quantity: '', unit: 'mL', reason: '' });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setItems(await api<PurchaseRequestSummary[]>('/purchases/mine'));
  }
  useEffect(() => {
    refresh();
    api<ReagentSummary[]>('/reagents').then(setReagents);
  }, []);

  async function submit() {
    try {
      await api('/purchases', { method: 'POST', body: JSON.stringify(form) });
      setForm({ reagentId: '', quantity: '', unit: 'mL', reason: '' });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? 'submit failed');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">我的采购申请</h1>
      <div className="mb-6 border p-4 rounded space-y-2">
        <div className="flex gap-2">
          <select
            className="border px-2 py-1"
            value={form.reagentId}
            onChange={(e) => setForm({ ...form, reagentId: e.target.value })}
          >
            <option value="">选择试剂</option>
            {reagents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className="border px-2 py-1"
            placeholder="数量"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <input
            className="border px-2 py-1 w-20"
            placeholder="单位"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
        <textarea
          className="border w-full px-2 py-1"
          placeholder="采购理由"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={submit}>
          提交
        </button>
      </div>
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">时间</th>
            <th className="border px-2 py-1">数量</th>
            <th className="border px-2 py-1">理由</th>
            <th className="border px-2 py-1">状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td className="border px-2 py-1">{new Date(p.createdAt).toLocaleString()}</td>
              <td className="border px-2 py-1">
                {p.quantity} {p.unit}
              </td>
              <td className="border px-2 py-1">{p.reason}</td>
              <td className="border px-2 py-1">{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: /admin/purchases 页面**

Create `apps/web/src/app/admin/purchases/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type {
  PurchaseRequestSummary,
  PurchaseBatchSummary,
} from '@app/shared';

export default function AdminPurchasesPage() {
  const [pending, setPending] = useState<PurchaseRequestSummary[]>([]);
  const [batches, setBatches] = useState<PurchaseBatchSummary[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [rec, setRec] = useState({
    actualQty: '',
    batchNo: '',
    mfgDate: '',
    expireDate: '',
    location: '',
    supplier: '',
    purchasePrice: '',
  });

  async function refresh() {
    const all = await api<(PurchaseRequestSummary & { batch?: PurchaseBatchSummary | null })[]>(
      '/purchases',
    );
    setPending(all.filter((p) => p.status === 'PENDING'));
    const map = new Map<string, PurchaseBatchSummary>();
    for (const p of all) {
      if (p.batch && !map.has(p.batch.id)) map.set(p.batch.id, p.batch);
    }
    setBatches(Array.from(map.values()));
  }
  useEffect(() => {
    refresh();
  }, []);

  function toggle(id: string) {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  }

  async function merge() {
    await api('/purchases/batches', {
      method: 'POST',
      body: JSON.stringify({ requestIds: Array.from(picked) }),
    });
    setPicked(new Set());
    await refresh();
  }

  async function receive() {
    if (!receiptFor) return;
    await api(`/purchases/batches/${receiptFor}/receipt`, {
      method: 'POST',
      body: JSON.stringify(rec),
    });
    setReceiptFor(null);
    setRec({
      actualQty: '',
      batchNo: '',
      mfgDate: '',
      expireDate: '',
      location: '',
      supplier: '',
      purchasePrice: '',
    });
    await refresh();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-3">待合并采购申请</h2>
      <table className="w-full border mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th></th>
            <th className="border px-2">申请人</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">数量</th>
            <th className="border px-2">理由</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((p) => (
            <tr key={p.id}>
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              </td>
              <td className="border px-2">{p.applicantId}</td>
              <td className="border px-2">{p.reagentId}</td>
              <td className="border px-2">
                {p.quantity} {p.unit}
              </td>
              <td className="border px-2">{p.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        disabled={picked.size === 0}
        className="bg-blue-600 text-white px-3 py-1 rounded mb-6 disabled:bg-gray-400"
        onClick={merge}
      >
        合并成批次
      </button>

      <h2 className="text-xl font-bold mb-3">批次</h2>
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2">id</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">总量</th>
            <th className="border px-2">状态</th>
            <th className="border px-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td className="border px-2">{b.id}</td>
              <td className="border px-2">{b.reagentId}</td>
              <td className="border px-2">
                {b.totalQty} {b.unit}
              </td>
              <td className="border px-2">{b.status}</td>
              <td className="border px-2">
                {b.status === 'APPROVED' && (
                  <button
                    className="text-blue-600 underline"
                    onClick={() => setReceiptFor(b.id)}
                  >
                    入库
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {receiptFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-96 space-y-2">
            <h3 className="font-bold">入库批次 {receiptFor}</h3>
            {(
              ['actualQty', 'batchNo', 'mfgDate', 'expireDate', 'location', 'supplier', 'purchasePrice'] as const
            ).map((k) => (
              <input
                key={k}
                className="border w-full px-2 py-1"
                placeholder={k}
                value={rec[k]}
                onChange={(e) => setRec({ ...rec, [k]: e.target.value })}
              />
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReceiptFor(null)}>取消</button>
              <button
                className="bg-blue-600 text-white px-3 py-1 rounded"
                onClick={receive}
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: /approvals/purchases 页面**

Create `apps/web/src/app/approvals/purchases/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { PurchaseBatchSummary, PurchaseRequestSummary } from '@app/shared';

export default function PurchaseApprovalsPage() {
  const [groups, setGroups] = useState<Record<string, { batch: PurchaseBatchSummary; items: PurchaseRequestSummary[] }>>({});
  const [comment, setComment] = useState<Record<string, string>>({});

  async function refresh() {
    const all = await api<PurchaseRequestSummary[]>('/purchases');
    const g: typeof groups = {};
    for (const p of all) {
      if (!p.batchId) continue;
      if (!g[p.batchId]) {
        g[p.batchId] = {
          batch: {
            id: p.batchId,
            labId: p.labId,
            reagentId: p.reagentId,
            totalQty: '0',
            unit: p.unit,
            status: 'PENDING',
            rejectedReason: null,
            createdBy: '',
            createdAt: p.createdAt,
          },
          items: [],
        };
      }
      g[p.batchId].items.push(p);
      g[p.batchId].batch.totalQty = String(
        Number(g[p.batchId].batch.totalQty) + Number(p.quantity),
      );
    }
    setGroups(g);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function decide(batchId: string, action: 'APPROVE' | 'REJECT') {
    await api(`/purchases/batches/${batchId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, comment: comment[batchId] ?? '' }),
    });
    await refresh();
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">采购批次审批</h1>
      {Object.entries(groups).map(([bid, g]) => (
        <div key={bid} className="border p-3 mb-3 rounded">
          <div className="font-semibold">批次 {bid}</div>
          <div className="text-sm text-gray-600">
            试剂 {g.batch.reagentId} 总量 {g.batch.totalQty} {g.batch.unit}
          </div>
          <ul className="text-sm mt-2">
            {g.items.map((i) => (
              <li key={i.id}>
                - {i.applicantId}: {i.quantity} {i.unit}（{i.reason}）
              </li>
            ))}
          </ul>
          <input
            className="border w-full px-2 py-1 mt-2"
            placeholder="备注 / 拒绝理由"
            value={comment[bid] ?? ''}
            onChange={(e) => setComment({ ...comment, [bid]: e.target.value })}
          />
          <div className="mt-2 flex gap-2">
            <button
              className="bg-green-600 text-white px-3 py-1 rounded"
              onClick={() => decide(bid, 'APPROVE')}
            >
              通过
            </button>
            <button
              className="bg-red-600 text-white px-3 py-1 rounded"
              onClick={() => decide(bid, 'REJECT')}
            >
              拒绝
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 更新 admin layout 侧栏**

Modify `apps/web/src/app/admin/layout.tsx` — 在 `<Link href="/admin/ledger">台账</Link>` 之后追加：

```tsx
<Link href="/admin/purchases" className="block">
  采购
</Link>
<Link href="/admin/alerts/config" className="block">
  预警配置
</Link>
```

- [ ] **Step 5: 前端 build 验证**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -20
```

Expected: 构建成功。新路由出现在输出：`/my/purchases`、`/admin/purchases`、`/approvals/purchases`。

- [ ] **Step 6: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web/src/app
git commit -m "feat(web): add purchase pages (my/admin/approvals)"
```

---

## Task 12: Web — 预警配置页

**Files:**
- Create: `apps/web/src/app/admin/alerts/config/page.tsx`

- [ ] **Step 1: 创建页面**

Create `apps/web/src/app/admin/alerts/config/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { LabReagentConfigSummary, ReagentSummary } from '@app/shared';

export default function AlertsConfigPage() {
  const [items, setItems] = useState<LabReagentConfigSummary[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [form, setForm] = useState({
    labId: '',
    reagentId: '',
    safetyStock: '',
    expireWarningDays: '30',
  });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const data = await api<LabReagentConfigSummary[]>('/lab-reagent-configs');
    setItems(data);
  }

  useEffect(() => {
    refresh();
    api<ReagentSummary[]>('/reagents').then(setReagents);
  }, []);

  async function save() {
    try {
      await api('/lab-reagent-configs', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          expireWarningDays: Number(form.expireWarningDays) || 30,
        }),
      });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? 'save failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('删除该配置？')) return;
    await api(`/lab-reagent-configs/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-3">预警阈值配置</h1>
      <div className="border p-3 rounded mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            className="border px-2 py-1"
            placeholder="labId"
            value={form.labId}
            onChange={(e) => setForm({ ...form, labId: e.target.value })}
          />
          <select
            className="border px-2 py-1"
            value={form.reagentId}
            onChange={(e) => setForm({ ...form, reagentId: e.target.value })}
          >
            <option value="">选择试剂</option>
            {reagents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className="border px-2 py-1"
            placeholder="安全阈值"
            value={form.safetyStock}
            onChange={(e) => setForm({ ...form, safetyStock: e.target.value })}
          />
          <input
            className="border px-2 py-1 w-24"
            placeholder="预警天数"
            value={form.expireWarningDays}
            onChange={(e) =>
              setForm({ ...form, expireWarningDays: e.target.value })
            }
          />
          <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={save}>
            新增
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2">lab</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">阈值</th>
            <th className="border px-2">预警天数</th>
            <th className="border px-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td className="border px-2">{c.labId}</td>
              <td className="border px-2">{c.reagentId}</td>
              <td className="border px-2">{c.safetyStock}</td>
              <td className="border px-2">{c.expireWarningDays}</td>
              <td className="border px-2">
                <button
                  className="text-red-600 underline"
                  onClick={() => remove(c.id)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 前端 build 验证**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -20
```

Expected: `/admin/alerts/config` 出现在路由列表。

- [ ] **Step 3: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web/src/app/admin/alerts
git commit -m "feat(web): add alerts config page"
```

---

## Task 13: 全量回归 + 手工验证 + Tag

**Files:**
- None (验证 + 打 tag)

- [ ] **Step 1: 全量 e2e 回归**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -30
```

Expected: 全部 suites 绿色（P1-P4 的 11 suites / 59 tests + P5 的 3 新 suites / ~30 tests）。

- [ ] **Step 2: 前端 build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -30
```

Expected: 构建成功；路由表含新 4 个页面 + 现有 12 个 = 16 个路由。

- [ ] **Step 3: 本地启动手工验证（API）**

启动后端与数据库：
```bash
pnpm run dev:api
```

用 curl 或 Postman：
- `POST /purchases`
- `POST /purchases/batches`
- `POST /purchases/batches/:id/approve`
- `POST /purchases/batches/:id/receipt`
- `GET /notifications`

确认：入库后 `GET /stocks?labId=lab-default` 有新批次，`GET /notifications` 有 `PURCHASE_RECEIVED`。

- [ ] **Step 4: 本地启动手工验证（Web）**

```bash
pnpm run dev:web
```

浏览器访问：
- `/my/purchases` 创建一条申请
- `/admin/purchases` 勾选合并
- `/approvals/purchases` 通过或驳回
- `/admin/purchases` 入库
- 右上角铃铛应出现未读消息

- [ ] **Step 5: 触发一次 runDaily 手工验证预警**

```bash
cd D:/Project/0417-any-demo/apps/api && node -e "
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AlertsService } = require('./dist/alerts/alerts.service');
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log'] });
  const n = await app.get(AlertsService).runDaily();
  console.log('notifs=', n);
  await app.close();
})();
"
```

> 需要先 `pnpm --filter @app/api build`。Expected: 控制台打印 `notifs=...`，站内消息写入。

- [ ] **Step 6: Commit + Tag**

```bash
cd D:/Project/0417-any-demo
git add -A
git diff --cached --quiet && echo "no pending changes" || git commit -m "chore: regression checkpoint for P5"
git tag p5-complete
```

Expected: tag `p5-complete` 创建成功。

---

## 完成检查

- [ ] Prisma 迁移 `add_p5_purchase_alerts` 应用
- [ ] `apps/api/src/notifications/**` + e2e 绿
- [ ] `apps/api/src/purchases/**` + e2e 绿（请求 / 合并 / 审批 / 入库）
- [ ] `apps/api/src/alerts/**` + e2e 绿（config + runDaily + scheduler）
- [ ] `packages/shared/dist/api-types.d.ts` 含 6 个新类型
- [ ] Web 4 个新页面 build 通过
- [ ] `<NotificationBell/>` 挂载到全局 layout
- [ ] `/admin/layout.tsx` 新增「采购」「预警配置」入口
- [ ] `pnpm --filter @app/api test:e2e` 全绿
- [ ] `pnpm --filter @app/web build` 通过
- [ ] 手工验证采购 + 预警链路
- [ ] Tag `p5-complete` 已打
