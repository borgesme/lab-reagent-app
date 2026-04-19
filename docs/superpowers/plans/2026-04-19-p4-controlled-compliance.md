# P4 · 管控合规 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管控试剂实现合规链路 —— 申请强校验 → 双级审批（LAB_HEAD + SAFETY_OFFICER）→ 双人发放（issuer ≠ witness，领用人签名）→ AuditLog 全量 → 管控台账查询/CSV 导出 + 每月自动归档。

**Architecture:** Prisma 增 `Approval.level`、`IssueRecord.witnessId/signatureDataUrl` 与新表 `ControlledLedgerSnapshot`。后端 `requests/` 三个 service 增强（P3 已有），新增 `ledger/` 模块（service/controller/scheduler）。shared 导出 `isControlled()` 判定函数。前端增强 `/my/requests`、`/approvals`、`/admin/issues` 并新增 `/admin/ledger` 页。

**Tech Stack:** 继承 P1-P3（NestJS / Prisma / Next.js / class-validator / Jest / vitest）。新增 `@nestjs/schedule`（cron）、`react-signature-canvas`（签名 canvas）。

**Spec:** `docs/superpowers/specs/2026-04-19-p4-controlled-compliance-design.md`

**Prerequisites:** P3 完成（commit `cb1f484`、tag `p3-complete`）。后端 e2e 10 suites / 37 tests 全绿、前端 build 11 路由。

---

## File Structure

```
packages/shared/src/
├─ utils.ts                                    # NEW  isControlled(reagent)
└─ api-types.ts                                # +ControlledLedgerRow +SnapshotSummary

apps/api/
├─ prisma/
│  ├─ schema.prisma                            # +Approval.level, +IssueRecord.witness*, +ControlledLedgerSnapshot
│  └─ migrations/<ts>_add_p4_compliance/migration.sql
└─ src/
   ├─ app.module.ts                            # +ScheduleModule.forRoot() +LedgerModule
   ├─ requests/
   │  ├─ requests.service.ts                   # 管控申请强校验
   │  ├─ approvals.service.ts                  # 双级审批
   │  ├─ issues.service.ts                     # 双人发放 + 签名
   │  └─ dto/
   │     ├─ approve-request.dto.ts             # +level
   │     └─ issue-request.dto.ts               # +witnessId +signatureDataUrl
   └─ ledger/                                  # NEW module
      ├─ ledger.module.ts
      ├─ ledger.service.ts
      ├─ ledger.controller.ts
      ├─ ledger.scheduler.ts
      └─ dto/query-ledger.dto.ts

apps/web/src/
├─ app/
│  ├─ my/requests/page.tsx                     # 管控徽章 + 强校验
│  ├─ approvals/page.tsx                       # level 区分
│  ├─ admin/
│  │  ├─ issues/page.tsx                       # +witness 下拉 +签名板
│  │  ├─ ledger/page.tsx                       # NEW 台账页
│  │  └─ layout.tsx                            # 侧栏加"台账"
│  └─ my/requests/page.tsx
└─ lib/
   └─ is-controlled.ts                         # NEW 复用 shared

apps/api/test/
├─ requests.e2e-spec.ts                        # 追加 ~10 case
└─ ledger.e2e-spec.ts                          # NEW ~7 case
```

**关键决策复述**（来自 spec）：
- 不改 `RequestStatus` enum，双级通过 `Approval` 条目判定
- `@Audit` 装饰器保持静态 action，`REQUEST_APPROVE` 一个 action 覆盖 level=1/2，`after.level` 区分
- 签名用 data URI 存 `IssueRecord.signatureDataUrl` (TEXT)，不上传文件
- CSV 用 Node 原生字符串拼装 + `\uFEFF` BOM，不引入 csv 库
- 台账快照在 `ControlledLedgerSnapshot` 表保存完整 csvContent，按 `(labId, yearMonth)` upsert
- `@Cron('5 0 1 * *')` 每月 1 号 00:05 触发；`generateMonthly(yearMonth, labId)` 作为公开方法供测试直接调用

---

## Task 1: Prisma migration — P4 字段与新表

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_p4_compliance/migration.sql`（自动生成）

- [ ] **Step 1: 修改 schema — Approval.level**

在 `apps/api/prisma/schema.prisma` 中定位 `model Approval`，替换为：

```prisma
model Approval {
  id         String         @id @default(cuid())
  requestId  String
  approverId String
  action     ApprovalAction
  level      Int            @default(1)
  comment    String?
  createdAt  DateTime       @default(now())

  request  Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
  approver User    @relation("ApprovalBy", fields: [approverId], references: [id])

  @@unique([requestId, level, action])
  @@index([requestId])
}
```

- [ ] **Step 2: 修改 schema — IssueRecord.witnessId + signatureDataUrl**

定位 `model IssueRecord`，替换为：

```prisma
model IssueRecord {
  id               String   @id @default(cuid())
  requestId        String   @unique
  issuerId         String
  receiverId       String
  witnessId        String?
  actualQty        Decimal  @db.Decimal(12, 3)
  stockId          String
  signatureDataUrl String?
  createdAt        DateTime @default(now())

  request  Request      @relation(fields: [requestId], references: [id], onDelete: Cascade)
  issuer   User         @relation("IssueRecordIssuer", fields: [issuerId], references: [id])
  receiver User         @relation("IssueRecordReceiver", fields: [receiverId], references: [id])
  witness  User?        @relation("IssueRecordWitness", fields: [witnessId], references: [id])
  stock    ReagentStock @relation(fields: [stockId], references: [id])

  @@index([stockId])
  @@index([witnessId])
}
```

- [ ] **Step 3: 修改 schema — User 反向关系**

定位 `model User`，在 `receivedRecords IssueRecord[] @relation("IssueRecordReceiver")` 下追加：

```prisma
  witnessRecords   IssueRecord[] @relation("IssueRecordWitness")
```

- [ ] **Step 4: 修改 schema — 新增 ControlledLedgerSnapshot**

在文件末尾追加：

```prisma
model ControlledLedgerSnapshot {
  id         String   @id @default(cuid())
  labId      String
  yearMonth  String
  csvContent String
  rowCount   Int
  createdAt  DateTime @default(now())

  @@unique([labId, yearMonth])
  @@index([labId])
}
```

> 注：`csvContent` 在 PostgreSQL 下默认是 `text` 类型（Prisma `String` 无长度时映射到 text），无需额外 `@db.Text`。

- [ ] **Step 5: 生成并应用迁移**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm prisma migrate dev --name add_p4_compliance
```

Expected: 生成新迁移目录、应用到 dev DB、重新生成 Prisma Client，无报错。

- [ ] **Step 6: 回归既有 e2e**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -15
```

Expected: 10 suites / 37 tests 全 PASS（schema 向后兼容）。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api/prisma
git commit -m "feat(api): add P4 compliance schema (Approval.level, IssueRecord.witness*, LedgerSnapshot)"
```

---

## Task 2: shared — `isControlled` 判定函数

**Files:**
- Create: `packages/shared/src/utils.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 utils.ts**

Create `packages/shared/src/utils.ts`:

```ts
import type { ReagentSummary } from './api-types';

export function isControlled(
  r: Pick<ReagentSummary, 'hazardLevel' | 'controlType'>,
): boolean {
  return r.hazardLevel === 'CONTROLLED' || r.controlType != null;
}
```

- [ ] **Step 2: 在 index.ts 导出**

修改 `packages/shared/src/index.ts`:

```ts
export * from './api-types';
export * from './utils';
```

- [ ] **Step 3: 构建 shared 包**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/shared build 2>&1 | tail -5
```

Expected: 构建成功，`packages/shared/dist/utils.d.ts` 与 `.js` 生成。

- [ ] **Step 4: Commit**

```bash
cd D:/Project/0417-any-demo
git add packages/shared
git commit -m "feat(shared): add isControlled helper"
```

---

## Task 3: 管控申请强校验（RequestsService）

**Files:**
- Modify: `apps/api/src/requests/requests.service.ts`
- Test: `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/test/requests.e2e-spec.ts` 的 `beforeAll` 中追加管控试剂 fixture（在原有 `reagentId`/`stockId` 准备之后）：

```ts
    const controlledReagent = await prisma.reagent.upsert({
      where: { id: 'reagent-ctrl-test' },
      update: {},
      create: {
        id: 'reagent-ctrl-test',
        name: 'TestReagent-Controlled',
        category: '管控',
        hazardLevel: 'CONTROLLED',
        controlType: 'TOXIC',
      },
    });
    const controlledStock = await prisma.reagentStock.create({
      data: {
        reagentId: controlledReagent.id,
        labId: 'lab-default',
        batchNo: 'CtrlBatch-01',
        initialQty: '500',
        currentQty: '500',
        unit: 'g',
      },
    });
```

在 `describe('Requests', ...)` 内，`describe('approvals', ...)` 块之前、所有普通 request 的 `it(...)` 之后追加：

```ts
  describe('controlled create validation', () => {
    let controlledReagentId: string;
    let controlledStockId: string;

    beforeAll(async () => {
      const r = await prisma.reagent.findUniqueOrThrow({ where: { id: 'reagent-ctrl-test' } });
      const s = await prisma.reagentStock.findFirstOrThrow({
        where: { reagentId: r.id, batchNo: 'CtrlBatch-01' },
      });
      controlledReagentId = r.id;
      controlledStockId = s.id;
    });

    it('rejects controlled request with short purpose', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '短用途',
          projectRef: 'P1',
          useLocation: 'L1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/purpose/i);
    });

    it('rejects controlled request missing projectRef', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明用于测试必填校验超过五十字的描述内容ABC',
          useLocation: 'L1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/projectRef/);
    });

    it('rejects controlled request missing useLocation', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明用于测试必填校验超过五十字的描述内容ABC',
          projectRef: 'P1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/useLocation/);
    });

    it('accepts controlled request meeting all rules', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '3',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明用于测试必填校验超过五十字的描述内容ABC',
          projectRef: 'P1',
          useLocation: 'L1',
        });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('PENDING');
    });
  });
```

- [ ] **Step 2: 运行测试观察失败**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --testPathPattern=requests --forceExit 2>&1 | tail -20
```

Expected: 新增的 4 个 case 中，前 3 个 FAIL（后端未拒绝），第 4 个可能 PASS（因为目前未校验长度但能创建成功）。核心是 3 个失败用例。

- [ ] **Step 3: 实现管控强校验**

修改 `apps/api/src/requests/requests.service.ts`，在 `import` 区追加：

```ts
import { isControlled } from '@app/shared';
```

替换 `create` 方法：

```ts
  async create(dto: CreateRequestDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');

    const stock = await this.prisma.reagentStock.findUnique({
      where: { id: dto.stockId },
      include: { reagent: true },
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

    if (isControlled(stock.reagent)) {
      if (!dto.purpose || dto.purpose.length < 50) {
        throw new BadRequestException('purpose must be >= 50 chars for controlled reagents');
      }
      if (!dto.projectRef) {
        throw new BadRequestException('projectRef is required for controlled reagents');
      }
      if (!dto.useLocation) {
        throw new BadRequestException('useLocation is required for controlled reagents');
      }
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
```

- [ ] **Step 4: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --testPathPattern=requests --forceExit 2>&1 | tail -30
```

Expected: `controlled create validation` 4 个 case 全 PASS；既有 requests 14 个 case 仍 PASS。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): enforce controlled reagent request validation"
```

---

## Task 4: 双级审批（ApprovalsService）

**Files:**
- Modify: `apps/api/src/requests/dto/approve-request.dto.ts`
- Modify: `apps/api/src/requests/approvals.service.ts`
- Test: `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/test/requests.e2e-spec.ts` 的 `describe('approvals', ...)` 块的 `beforeAll` 之后（保留原有 4 个 case），追加：

```ts
    describe('two-level for controlled', () => {
      let safetyToken: string;
      let safetyId: string;
      let ctrlPendingId: string;

      beforeAll(async () => {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send({ email: 'safety@lab.local', name: 'Safety', password: 'pass1234' });
        const u = await prisma.user.findUnique({ where: { email: 'safety@lab.local' } });
        safetyId = u!.id;
        const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SAFETY_OFFICER' } });
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: safetyId, roleId: role.id } },
          update: {},
          create: { userId: safetyId, roleId: role.id },
        });
        await prisma.user.update({
          where: { id: safetyId },
          data: { labId: 'lab-default' },
        });
        const login = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'safety@lab.local', password: 'pass1234' });
        safetyToken = login.body.accessToken;

        const ctrl = await prisma.reagent.findUniqueOrThrow({ where: { id: 'reagent-ctrl-test' } });
        const st = await prisma.reagentStock.findFirstOrThrow({
          where: { reagentId: ctrl.id, batchNo: 'CtrlBatch-01' },
        });
        const create = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId: ctrl.id,
            stockId: st.id,
            quantity: '2',
            unit: 'g',
            purpose: '这是一段足够长的管控试剂用途说明用于测试必填校验超过五十字的描述内容ABC',
            projectRef: 'P-ctrl',
            useLocation: 'Lab-A',
          });
        ctrlPendingId = create.body.id;
      });

      it('level=2 before level=1 returns 400', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/level=1/);
      });

      it('LAB_HEAD level=1 APPROVE keeps PENDING', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 1 });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('PENDING');
        expect(r.body.approval.level).toBe(1);
      });

      it('LAB_HEAD cannot submit level=2 → 403', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(403);
      });

      it('SAFETY_OFFICER level=2 APPROVE → APPROVED', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('APPROVED');
        expect(r.body.approval.level).toBe(2);
      });

      it('SAFETY_OFFICER on non-controlled level=1 → 403', async () => {
        const plainCreate = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId,
            stockId,
            quantity: '3',
            unit: 'mL',
            purpose: '安全员越权测试',
          });
        const r = await request(app.getHttpServer())
          .post(`/requests/${plainCreate.body.id}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 1 });
        expect(r.status).toBe(403);
      });

      it('level=2 on non-controlled returns 400', async () => {
        const plainCreate = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId,
            stockId,
            quantity: '3',
            unit: 'mL',
            purpose: 'level 2 对普通无意义',
          });
        await request(app.getHttpServer())
          .post(`/requests/${plainCreate.body.id}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 1 });
        const r = await request(app.getHttpServer())
          .post(`/requests/${plainCreate.body.id}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/level=2 not applicable/);
      });
    });
```

Run → 预期 FAIL。

- [ ] **Step 2: 更新 DTO**

覆盖 `apps/api/src/requests/dto/approve-request.dto.ts`:

```ts
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalAction } from '@prisma/client';

export class ApproveRequestDto {
  @IsEnum(ApprovalAction) action!: ApprovalAction;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2]) level?: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
```

- [ ] **Step 3: 实现 ApprovalsService 增强**

覆盖 `apps/api/src/requests/approvals.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalAction, RequestStatus } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async approve(requestId: string, dto: ApproveRequestDto, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { reagent: true, approvals: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`request is ${req.status}, not PENDING`);
    }
    if (req.applicantId === actor.sub) {
      throw new ForbiddenException('cannot approve own request');
    }

    const level = dto.level ?? 1;
    const controlled = isControlled(req.reagent);

    if (level === 2 && !controlled) {
      throw new BadRequestException('level=2 not applicable to non-controlled requests');
    }

    if (!actor.roles.includes('SYS_ADMIN')) {
      if (level === 1 && !actor.roles.includes('LAB_HEAD')) {
        throw new ForbiddenException('level=1 requires LAB_HEAD');
      }
      if (level === 2 && !actor.roles.includes('SAFETY_OFFICER')) {
        throw new ForbiddenException('level=2 requires SAFETY_OFFICER');
      }
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (user?.labId !== req.labId) throw new ForbiddenException('cross-lab');
    }

    if (level === 2 && controlled) {
      const hasLevel1Approve = req.approvals.some(
        (a) => a.level === 1 && a.action === ApprovalAction.APPROVE,
      );
      if (!hasLevel1Approve) {
        throw new BadRequestException('level=1 approval required first');
      }
    }

    const isReject = dto.action === ApprovalAction.REJECT;
    const isApprove = dto.action === ApprovalAction.APPROVE;

    let nextStatus: RequestStatus = RequestStatus.PENDING;
    if (isReject) {
      nextStatus = RequestStatus.REJECTED;
    } else if (isApprove) {
      if (!controlled) {
        nextStatus = RequestStatus.APPROVED;
      } else {
        const afterInsertLevels = new Set(
          req.approvals
            .filter((a) => a.action === ApprovalAction.APPROVE)
            .map((a) => a.level)
            .concat([level]),
        );
        if (afterInsertLevels.has(1) && afterInsertLevels.has(2)) {
          nextStatus = RequestStatus.APPROVED;
        }
      }
    }

    const [approval, updated] = await this.prisma.$transaction([
      this.prisma.approval.create({
        data: {
          requestId,
          approverId: actor.sub,
          action: dto.action,
          level,
          comment: dto.comment,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          rejectedReason: isReject
            ? `L${level}: ${dto.comment ?? ''}`.trim()
            : null,
        },
      }),
    ]);

    return { approval, request: updated };
  }
}
```

- [ ] **Step 4: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --testPathPattern=requests --forceExit 2>&1 | tail -30
```

Expected: `two-level for controlled` 6 个 case 全 PASS；既有 approvals 4 case 仍 PASS；其他 requests case 仍 PASS。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add two-level approval for controlled reagents"
```

---

## Task 5: 双人发放 + 签名校验（IssuesService）

**Files:**
- Modify: `apps/api/src/requests/dto/issue-request.dto.ts`
- Modify: `apps/api/src/requests/issues.service.ts`
- Test: `apps/api/test/requests.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/test/requests.e2e-spec.ts` 的 `describe('issues', ...)` 块内 `afterAll` / 末尾之前追加：

```ts
    describe('controlled double-witness', () => {
      let safetyToken: string;
      let ctrlApprovedId: string;
      let adminUserId: string;
      let labHeadId2: string;
      const validSig = 'data:image/png;base64,iVBORw0KGgoAAAANS' + 'A'.repeat(64);

      beforeAll(async () => {
        const sfLogin = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'safety@lab.local', password: 'pass1234' });
        safetyToken = sfLogin.body.accessToken;

        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: 'admin@lab.local' },
        });
        adminUserId = admin.id;
        await prisma.user.update({
          where: { id: adminUserId },
          data: { labId: 'lab-default' },
        });

        const lh = await prisma.user.findUniqueOrThrow({
          where: { email: 'labhead@lab.local' },
        });
        labHeadId2 = lh.id;

        const ctrl = await prisma.reagent.findUniqueOrThrow({ where: { id: 'reagent-ctrl-test' } });
        const st = await prisma.reagentStock.findFirstOrThrow({
          where: { reagentId: ctrl.id, batchNo: 'CtrlBatch-01' },
        });
        const create = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId: ctrl.id,
            stockId: st.id,
            quantity: '4',
            unit: 'g',
            purpose: '这是一段足够长的管控试剂用途说明用于测试必填校验超过五十字的描述内容ABC',
            projectRef: 'P-iss',
            useLocation: 'Lab-A',
          });
        ctrlApprovedId = create.body.id;
        await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 1 });
        await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
      });

      it('rejects controlled issue missing witnessId', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ actualQty: '4', signatureDataUrl: validSig });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witnessId/);
      });

      it('rejects controlled issue missing signature', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ actualQty: '4', witnessId: labHeadId2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/signature/i);
      });

      it('rejects when witness === issuer', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: adminUserId,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witness/);
      });

      it('rejects when witness has wrong role', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: plainUserId,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witness/);
      });

      it('accepts controlled issue with lab_head witness and decrements stock', async () => {
        const ctrlStock = await prisma.reagentStock.findFirstOrThrow({
          where: { batchNo: 'CtrlBatch-01' },
        });
        const before = Number(ctrlStock.currentQty);

        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: labHeadId2,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('ISSUED');
        expect(r.body.issue.witnessId).toBe(labHeadId2);
        expect(r.body.issue.signatureDataUrl).toContain('data:image/');

        const after = await prisma.reagentStock.findUniqueOrThrow({ where: { id: ctrlStock.id } });
        expect(before - Number(after.currentQty)).toBeCloseTo(4, 3);
      });
    });
```

Run → 预期 FAIL。

- [ ] **Step 2: 更新 DTO**

覆盖 `apps/api/src/requests/dto/issue-request.dto.ts`:

```ts
import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class IssueRequestDto {
  @IsDecimal({ decimal_digits: '0,3' }) actualQty!: string;
  @IsOptional() @IsString() receiverId?: string;
  @IsOptional() @IsString() witnessId?: string;
  @IsOptional() @IsString() @MaxLength(1_500_000) signatureDataUrl?: string;
}
```

> 1.5 MB 上限对应 1 MB 二进制签名 base64 编码后的长度。

- [ ] **Step 3: 实现 IssuesService 增强**

覆盖 `apps/api/src/requests/issues.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IssueRequestDto } from './dto/issue-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class IssuesService {
  constructor(private prisma: PrismaService) {}

  async issue(requestId: string, dto: IssueRequestDto, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { reagent: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(`request is ${req.status}, not APPROVED`);
    }
    await this.assertIssuer(req.labId, actor);

    const controlled = isControlled(req.reagent);

    if (controlled) {
      if (!dto.witnessId) {
        throw new BadRequestException('witnessId is required for controlled reagents');
      }
      if (!dto.signatureDataUrl || !dto.signatureDataUrl.startsWith('data:image/')) {
        throw new BadRequestException('signatureDataUrl (data:image/*) required');
      }
      if (dto.witnessId === actor.sub) {
        throw new BadRequestException('witness must differ from issuer');
      }
      const witness = await this.prisma.user.findUnique({
        where: { id: dto.witnessId },
        include: { roles: { include: { role: true } } },
      });
      if (!witness) throw new BadRequestException('witness not found');
      if (witness.labId !== req.labId) {
        throw new BadRequestException('witness not in same lab');
      }
      const witnessRoles = witness.roles.map((r) => r.role.code);
      const allowed = witnessRoles.some(
        (c) => c === 'LAB_HEAD' || c === 'REAGENT_ADMIN',
      );
      if (!allowed) {
        throw new BadRequestException('witness must be LAB_HEAD or REAGENT_ADMIN');
      }
    }

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
          witnessId: dto.witnessId ?? null,
          actualQty: dto.actualQty,
          stockId: req.stockId,
          signatureDataUrl: dto.signatureDataUrl ?? null,
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

- [ ] **Step 4: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --testPathPattern=requests --forceExit 2>&1 | tail -30
```

Expected: `controlled double-witness` 5 个 case 全 PASS；issues 原有 4 case 仍 PASS；requests suite 总计 ~29 case 全 PASS。

- [ ] **Step 5: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add double-witness issue with signature for controlled reagents"
```

---

## Task 6: Ledger 模块 — 查询 + CSV 导出

**Files:**
- Create: `apps/api/src/ledger/ledger.module.ts`
- Create: `apps/api/src/ledger/ledger.service.ts`
- Create: `apps/api/src/ledger/ledger.controller.ts`
- Create: `apps/api/src/ledger/dto/query-ledger.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/ledger.e2e-spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/api/test/ledger.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ledger', () => {
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

    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = aLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ledger-plain@lab.local', name: 'P', password: 'pass1234' });
    const pLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ledger-plain@lab.local', password: 'pass1234' });
    plainToken = pLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('plain user forbidden', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(403);
  });

  it('admin JSON returns only controlled rows', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=json')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    for (const row of r.body) {
      expect(['CONTROLLED']).toContain(row.hazardLevel);
    }
  });

  it('admin CSV returns text/csv with BOM', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    const firstLine = r.text.replace(/^\uFEFF/, '').split('\n')[0];
    expect(firstLine).toContain('date');
    expect(firstLine).toContain('reagentName');
    expect(firstLine).toContain('signed');
  });

  it('date range filter', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=json&from=2100-01-01&to=2100-12-31')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});
```

Run → 预期 FAIL（端点不存在）。

- [ ] **Step 2: 实现 DTO**

Create `apps/api/src/ledger/dto/query-ledger.dto.ts`:

```ts
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class QueryLedgerDto {
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}
```

- [ ] **Step 3: 实现 LedgerService**

Create `apps/api/src/ledger/ledger.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';

export interface LedgerActor {
  sub: string;
  roles: string[];
}

export interface LedgerRow {
  date: string;
  reagentName: string;
  batchNo: string;
  hazardLevel: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
  labId: string;
}

const CSV_HEADERS: (keyof LedgerRow)[] = [
  'date',
  'reagentName',
  'batchNo',
  'controlType',
  'applicant',
  'projectRef',
  'purpose',
  'actualQty',
  'unit',
  'issuer',
  'witness',
  'signed',
];

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  async resolveLabScope(query: QueryLedgerDto, actor: LedgerActor): Promise<string | undefined> {
    if (actor.roles.includes('SYS_ADMIN')) return query.labId;
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');
    return user.labId;
  }

  async query(query: QueryLedgerDto, actor: LedgerActor): Promise<LedgerRow[]> {
    const allowed = ['LAB_HEAD', 'REAGENT_ADMIN', 'SAFETY_OFFICER', 'SYS_ADMIN'];
    if (!actor.roles.some((r) => allowed.includes(r))) {
      throw new ForbiddenException('role not allowed');
    }
    const labId = await this.resolveLabScope(query, actor);

    const where: Prisma.IssueRecordWhereInput = {};
    if (labId) where.request = { labId };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as any).gte = new Date(query.from);
      if (query.to) (where.createdAt as any).lte = new Date(query.to);
    }

    const issues = await this.prisma.issueRecord.findMany({
      where,
      include: {
        request: { include: { reagent: true, applicant: true, stock: true } },
        issuer: true,
        witness: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return issues
      .filter((i) => isControlled(i.request.reagent))
      .map<LedgerRow>((i) => ({
        date: i.createdAt.toISOString().slice(0, 10),
        reagentName: i.request.reagent.name,
        batchNo: i.request.stock.batchNo ?? '',
        hazardLevel: i.request.reagent.hazardLevel,
        controlType: i.request.reagent.controlType,
        applicant: i.request.applicant.name,
        projectRef: i.request.projectRef ?? '',
        purpose: i.request.purpose,
        actualQty: i.actualQty.toString(),
        unit: i.request.unit,
        issuer: i.issuer.name,
        witness: i.witness?.name ?? '',
        signed: i.signatureDataUrl ? 'Y' : 'N',
        labId: i.request.labId,
      }));
  }

  toCsv(rows: LedgerRow[]): string {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const head = CSV_HEADERS.join(',');
    const body = rows.map((r) => CSV_HEADERS.map((k) => esc(r[k])).join(',')).join('\n');
    return '\uFEFF' + head + (body ? '\n' + body : '\n');
  }
}
```

- [ ] **Step 4: 实现 LedgerController**

Create `apps/api/src/ledger/ledger.controller.ts`:

```ts
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LedgerService } from './ledger.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('controlled-ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @Audit({ action: 'LEDGER_EXPORT', entityType: 'ControlledLedger' })
  async query(
    @Query() q: QueryLedgerDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.ledger.query(q, user);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="controlled-ledger.csv"`,
      );
      return this.ledger.toCsv(rows);
    }
    return rows;
  }
}
```

- [ ] **Step 5: 创建 Module 并挂到 AppModule**

Create `apps/api/src/ledger/ledger.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Module({
  providers: [LedgerService],
  controllers: [LedgerController],
  exports: [LedgerService],
})
export class LedgerModule {}
```

修改 `apps/api/src/app.module.ts`——在 imports 数组 `RequestsModule` 之后追加：

```ts
import { LedgerModule } from './ledger/ledger.module';
// imports 数组:
    RequestsModule,
    LedgerModule,
```

- [ ] **Step 6: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --testPathPattern=ledger --forceExit 2>&1 | tail -20
```

Expected: `ledger.e2e-spec.ts` 4 个 case 全 PASS。

再跑全量回归：
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -10
```
Expected: 11 suites 全 PASS。

- [ ] **Step 7: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api
git commit -m "feat(api): add controlled ledger query with CSV export"
```

---

## Task 7: Ledger 快照 + Scheduler（@nestjs/schedule）

**Files:**
- Modify: `apps/api/package.json`（加 `@nestjs/schedule`）
- Modify: `apps/api/src/app.module.ts`（`ScheduleModule.forRoot()`）
- Modify: `apps/api/src/ledger/ledger.service.ts`（+ `generateMonthly`、snapshot 查询）
- Modify: `apps/api/src/ledger/ledger.controller.ts`（+ `/snapshots` 路由）
- Create: `apps/api/src/ledger/ledger.scheduler.ts`
- Modify: `apps/api/src/ledger/ledger.module.ts`
- Test: `apps/api/test/ledger.e2e-spec.ts`

- [ ] **Step 1: 安装依赖**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/api add @nestjs/schedule
```

Expected: `apps/api/package.json` dependencies 新增 `"@nestjs/schedule": "^X.Y.Z"`；`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 写失败测试**

在 `apps/api/test/ledger.e2e-spec.ts` 的 `afterAll` 之前追加：

```ts
  describe('snapshots', () => {
    it('service.generateMonthly upserts snapshot', async () => {
      const svc = app.get<any>(require('../src/ledger/ledger.service').LedgerService);
      const snap = await svc.generateMonthly('2100-03', 'lab-default');
      expect(snap.labId).toBe('lab-default');
      expect(snap.yearMonth).toBe('2100-03');
      expect(typeof snap.csvContent).toBe('string');
      expect(snap.csvContent.charCodeAt(0)).toBe(0xfeff);

      const again = await svc.generateMonthly('2100-03', 'lab-default');
      expect(again.id).toBe(snap.id);
    });

    it('GET /controlled-ledger/snapshots lists by desc', async () => {
      const r = await request(app.getHttpServer())
        .get('/controlled-ledger/snapshots')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
    });

    it('GET /controlled-ledger/snapshots/:id returns CSV', async () => {
      const svc = app.get<any>(require('../src/ledger/ledger.service').LedgerService);
      const snap = await svc.generateMonthly('2100-04', 'lab-default');
      const r = await request(app.getHttpServer())
        .get(`/controlled-ledger/snapshots/${snap.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.text.charCodeAt(0)).toBe(0xfeff);
    });
  });
```

Run → 预期 FAIL。

- [ ] **Step 3: 扩展 LedgerService**

在 `apps/api/src/ledger/ledger.service.ts` 的 `LedgerService` 类末尾追加：

```ts
  async generateMonthly(yearMonth: string, labId: string) {
    const [y, m] = yearMonth.split('-').map((s) => Number(s));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const issues = await this.prisma.issueRecord.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        request: { labId },
      },
      include: {
        request: { include: { reagent: true, applicant: true, stock: true } },
        issuer: true,
        witness: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows: LedgerRow[] = issues
      .filter((i) => isControlled(i.request.reagent))
      .map((i) => ({
        date: i.createdAt.toISOString().slice(0, 10),
        reagentName: i.request.reagent.name,
        batchNo: i.request.stock.batchNo ?? '',
        hazardLevel: i.request.reagent.hazardLevel,
        controlType: i.request.reagent.controlType,
        applicant: i.request.applicant.name,
        projectRef: i.request.projectRef ?? '',
        purpose: i.request.purpose,
        actualQty: i.actualQty.toString(),
        unit: i.request.unit,
        issuer: i.issuer.name,
        witness: i.witness?.name ?? '',
        signed: i.signatureDataUrl ? 'Y' : 'N',
        labId: i.request.labId,
      }));

    const csvContent = this.toCsv(rows);

    const snap = await this.prisma.controlledLedgerSnapshot.upsert({
      where: { labId_yearMonth: { labId, yearMonth } },
      update: { csvContent, rowCount: rows.length },
      create: { labId, yearMonth, csvContent, rowCount: rows.length },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'LEDGER_SNAPSHOT_GENERATE',
        entityType: 'ControlledLedgerSnapshot',
        entityId: snap.id,
        after: { labId, yearMonth, rowCount: rows.length } as any,
      },
    });

    return snap;
  }

  async listSnapshots(labId: string | undefined, actor: LedgerActor) {
    const scope = await this.resolveLabScope({ labId }, actor);
    return this.prisma.controlledLedgerSnapshot.findMany({
      where: scope ? { labId: scope } : {},
      orderBy: { yearMonth: 'desc' },
    });
  }

  async getSnapshot(id: string, actor: LedgerActor) {
    const snap = await this.prisma.controlledLedgerSnapshot.findUnique({ where: { id } });
    if (!snap) return null;
    if (!actor.roles.includes('SYS_ADMIN')) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (user?.labId !== snap.labId) return null;
    }
    return snap;
  }

  listAllLabIds() {
    return this.prisma.lab.findMany({ select: { id: true } });
  }
```

将 `QueryLedgerDto` import 若未包含 `labId` 可选字段，回查确认已存在（Task 6 已加）。

- [ ] **Step 4: 扩展 LedgerController**

在 `apps/api/src/ledger/ledger.controller.ts` 的 `LedgerController` 类末尾追加：

```ts
  @Get('snapshots')
  async listSnapshots(
    @Query('labId') labId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.ledger.listSnapshots(labId, user);
  }

  @Get('snapshots/:id')
  async getSnapshot(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const snap = await this.ledger.getSnapshot(id, user);
    if (!snap) {
      res.status(404);
      return null;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${snap.yearMonth}.csv"`,
    );
    return snap.csvContent;
  }
```

在 controller 顶部 import 区追加：

```ts
import { Param } from '@nestjs/common';
```

（如已 import `Param` 跳过）

- [ ] **Step 5: 创建 Scheduler**

Create `apps/api/src/ledger/ledger.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LedgerService } from './ledger.service';

@Injectable()
export class LedgerScheduler {
  private readonly logger = new Logger(LedgerScheduler.name);

  constructor(private readonly ledger: LedgerService) {}

  @Cron('5 0 1 * *')
  async monthly() {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const yearMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    const labs = await this.ledger.listAllLabIds();
    for (const { id } of labs) {
      await this.ledger.generateMonthly(yearMonth, id);
    }
    this.logger.log(`generated snapshots for ${yearMonth}, labs=${labs.length}`);
  }
}
```

- [ ] **Step 6: 更新 LedgerModule**

覆盖 `apps/api/src/ledger/ledger.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerScheduler } from './ledger.scheduler';

@Module({
  providers: [LedgerService, LedgerScheduler],
  controllers: [LedgerController],
  exports: [LedgerService],
})
export class LedgerModule {}
```

- [ ] **Step 7: 在 AppModule 启用 ScheduleModule**

修改 `apps/api/src/app.module.ts`：

在 imports 区顶部追加：

```ts
import { ScheduleModule } from '@nestjs/schedule';
```

在 imports 数组最前面（紧跟 `ConfigModule.forRoot`）插入 `ScheduleModule.forRoot()`：

```ts
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ...
  ],
```

- [ ] **Step 8: 运行测试**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -15
```

Expected: ledger suite 7 case 全 PASS（4 原 + 3 新增）；其他 suite 仍绿。

- [ ] **Step 9: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/api packages
git commit -m "feat(api): add ledger monthly snapshot with cron scheduler"
```

---

## Task 8: Web — 申请页 + 审批页（管控增强）

**Files:**
- Modify: `apps/web/src/app/my/requests/page.tsx`
- Modify: `apps/web/src/app/approvals/page.tsx`

- [ ] **Step 1: 更新 `/my/requests` 表单**

覆盖 `apps/web/src/app/my/requests/page.tsx` 的 import 区最上方（在 `'use client';` 之后）加：

```tsx
import { isControlled } from '@app/shared';
```

接着在 `Reagent` 接口下面扩展：

```tsx
interface Reagent {
  id: string;
  name: string;
  hazardLevel?: 'NORMAL' | 'DANGEROUS' | 'CONTROLLED';
  controlType?: string | null;
}
```

在 `export default function MyRequestsPage() { ... }` 内、 `const stocksForReagent = ...` 之前增加：

```tsx
  const reagent = reagents.find((x) => x.id === reagentId);
  const controlled = reagent
    ? isControlled({
        hazardLevel: (reagent.hazardLevel ?? 'NORMAL') as any,
        controlType: (reagent.controlType ?? null) as any,
      })
    : false;
  const purposeTooShort = controlled && purpose.trim().length < 50;
```

在 `<form ...>` 中的 purpose `<input>` 一行替换为 textarea + 红色提示：

```tsx
          <textarea
            className={
              'border p-2 col-span-5 ' + (purposeTooShort ? 'border-red-500' : '')
            }
            rows={controlled ? 3 : 2}
            placeholder={
              controlled
                ? '用途（管控试剂必填 ≥50 字）'
                : '用途（必填）'
            }
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
```

在 purpose 之后插入两行新字段（仅管控时展示红色必填提示）：

```tsx
          <input
            className="border p-2 col-span-3"
            placeholder={controlled ? '项目号（管控必填）' : '项目号（可选）'}
            value={projectRef}
            onChange={(e) => setProjectRef(e.target.value)}
            required={controlled}
          />
          <input
            className="border p-2 col-span-3"
            placeholder={controlled ? '使用地点（管控必填）' : '使用地点（可选）'}
            value={useLocation}
            onChange={(e) => setUseLocation(e.target.value)}
            required={controlled}
          />
```

在组件顶部 state 区追加：

```tsx
  const [projectRef, setProjectRef] = useState('');
  const [useLocation, setUseLocation] = useState('');
```

在 reagent `<select>` 下方插入管控徽章：

```tsx
          {controlled && (
            <div className="col-span-6 bg-red-100 text-red-800 text-sm p-2 rounded">
              管控试剂：purpose ≥50 字，项目号、使用地点必填
            </div>
          )}
```

在 `onSubmit` 的 `apiFetch('/requests', ...)` body 中加入新字段：

```tsx
        body: {
          reagentId,
          stockId,
          quantity,
          unit,
          purpose,
          projectRef: projectRef || undefined,
          useLocation: useLocation || undefined,
        },
```

并在 submit 成功后 reset 新增 state：

```tsx
      setProjectRef('');
      setUseLocation('');
```

- [ ] **Step 2: 更新 `/approvals` 页支持 level**

覆盖 `apps/web/src/app/approvals/page.tsx`，在现有 `decide` 函数内把 body 替换为支持 level：

```tsx
  async function decide(id: string, action: 'APPROVE' | 'REJECT', level: 1 | 2) {
    try {
      await apiFetch(`/requests/${id}/approvals`, {
        method: 'POST',
        token,
        body: { action, level, comment: commentById[id] },
      });
      setCommentById((m) => ({ ...m, [id]: '' }));
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }
```

扩展 `RequestItem` 接口加 reagent 字段：

```tsx
interface RequestItem {
  id: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
  approvals?: { level: number; action: string }[];
}
```

修改 `refresh` 函数加 `include`（列表已由后端返回，此处只保留展示）。

在 `onClick={() => decide(r.id, 'APPROVE')}` 两处替换为：

```tsx
                    <button
                      className="bg-green-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'APPROVE', 1)}
                    >
                      一审通过
                    </button>
                    <button
                      className="bg-red-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'REJECT', 1)}
                    >
                      一审拒绝
                    </button>
                    {(r.reagent.hazardLevel === 'CONTROLLED' ||
                      r.reagent.controlType) && (
                      <>
                        <button
                          className="bg-green-700 text-white px-3 py-1 text-sm"
                          onClick={() => decide(r.id, 'APPROVE', 2)}
                        >
                          二审通过
                        </button>
                        <button
                          className="bg-red-700 text-white px-3 py-1 text-sm"
                          onClick={() => decide(r.id, 'REJECT', 2)}
                        >
                          二审拒绝
                        </button>
                      </>
                    )}
```

> 后端会根据登录角色拒绝越权，前端一键展示两套即可；实际按钮可见性由后端 403 反馈兜底。

- [ ] **Step 3: 构建**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -15
```

Expected: build 成功，`/my/requests`、`/approvals` 仍在路由清单。

- [ ] **Step 4: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): controlled reagent UX on request and approval pages"
```

---

## Task 9: Web — 双人发放（签名板） + 台账页

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/admin/issues/page.tsx`
- Create: `apps/web/src/app/admin/ledger/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: 安装签名依赖**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web add react-signature-canvas && pnpm --filter @app/web add -D @types/react-signature-canvas
```

Expected: `apps/web/package.json` 含 `react-signature-canvas` 与 `@types/react-signature-canvas`。

- [ ] **Step 2: 升级 `/admin/issues` 支持管控字段**

覆盖 `apps/web/src/app/admin/issues/page.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface UserLite { id: string; name: string; email: string; }

interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: UserLite;
  labId: string;
}

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [witnesses, setWitnesses] = useState<UserLite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [witnessById, setWitnessById] = useState<Record<string, string>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});

  async function refresh() {
    if (!token) return;
    try {
      const [ap, iss, users] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
        apiFetch<UserLite[]>('/users', { token }).catch(() => []),
      ]);
      setPending(ap);
      setIssued(iss);
      setWitnesses(users);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [token]);

  const isCtrl = (r: RequestItem) =>
    r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      const body: Record<string, unknown> = { actualQty };
      if (isCtrl(r)) {
        body.witnessId = witnessById[r.id];
        const sig = sigRefs.current[r.id];
        if (!sig || sig.isEmpty()) {
          throw new Error('请领用人签名后再发放');
        }
        body.signatureDataUrl = sig.toDataURL('image/png');
      }
      await apiFetch(`/requests/${r.id}/issues`, { method: 'POST', token, body });
      sigRefs.current[r.id]?.clear();
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      setWitnessById((m) => ({ ...m, [r.id]: '' }));
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
      <ul className="space-y-3 mb-6">
        {pending.map((r) => {
          const ctrl = isCtrl(r);
          const candidates = witnesses.filter((u) => u.id !== '' );
          return (
            <li key={r.id} className="border p-3 rounded">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">
                    {r.reagent.name} · 批号 {r.stock.batchNo ?? '-'} · 申请 {r.quantity}{r.unit}
                    {ctrl && <span className="ml-2 text-red-600 text-sm">[管控]</span>}
                  </div>
                  <div className="text-sm text-gray-700">{r.applicant.name} · {r.purpose}</div>
                </div>
                <input
                  className="border p-1 w-24 text-sm"
                  placeholder={`实际量 (${r.unit})`}
                  value={qtyById[r.id] ?? ''}
                  onChange={(e) => setQtyById((m) => ({ ...m, [r.id]: e.target.value }))}
                />
              </div>
              {ctrl && (
                <div className="mt-2 space-y-2">
                  <select
                    className="border p-1 text-sm"
                    value={witnessById[r.id] ?? ''}
                    onChange={(e) => setWitnessById((m) => ({ ...m, [r.id]: e.target.value }))}
                  >
                    <option value="">选择见证人</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">领用人签名：</div>
                    <SignatureCanvas
                      ref={(el) => (sigRefs.current[r.id] = el)}
                      canvasProps={{ width: 400, height: 120, className: 'border' }}
                    />
                    <button
                      type="button"
                      className="text-xs text-gray-500 underline ml-2"
                      onClick={() => sigRefs.current[r.id]?.clear()}
                    >清空</button>
                  </div>
                </div>
              )}
              <button
                className="bg-blue-600 text-white px-3 py-1 text-sm mt-2"
                onClick={() => issue(r)}
              >发放</button>
            </li>
          );
        })}
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
              <td className="p-2">{r.quantity} {r.unit}</td>
              <td className="p-2">{r.applicant.name}</td>
              <td className="p-2">{r.purpose}</td>
              <td className="p-2">{r.createdAt.slice(0, 16).replace('T', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: 创建 `/admin/ledger` 页**

Create `apps/web/src/app/admin/ledger/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch, apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Row {
  date: string;
  reagentName: string;
  batchNo: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
}

interface Snapshot {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}

export default function LedgerPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [rows, setRows] = useState<Row[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const qs = new URLSearchParams({ format: 'json' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const data = await apiFetch<Row[]>(`/controlled-ledger?${qs}`, { token });
      const snapList = await apiFetch<Snapshot[]>('/controlled-ledger/snapshots', { token });
      setRows(data);
      setSnaps(snapList);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [token]);

  async function download(path: string, filename: string) {
    const resp = await fetch(apiBaseUrl + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">管控台账</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <div className="flex gap-2 mb-3 items-center">
        <input
          type="date"
          className="border p-1 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>至</span>
        <input
          type="date"
          className="border p-1 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button className="bg-gray-700 text-white px-3 py-1 text-sm" onClick={refresh}>
          刷新
        </button>
        <button
          className="bg-blue-600 text-white px-3 py-1 text-sm"
          onClick={() => {
            const qs = new URLSearchParams({ format: 'csv' });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            download(`/controlled-ledger?${qs}`, 'controlled-ledger.csv');
          }}
        >下载 CSV</button>
      </div>

      <table className="w-full border text-sm mb-6">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-1 text-left">日期</th>
            <th className="p-1 text-left">试剂</th>
            <th className="p-1 text-left">批号</th>
            <th className="p-1 text-left">管控类型</th>
            <th className="p-1 text-left">申请人</th>
            <th className="p-1 text-left">项目</th>
            <th className="p-1 text-left">实发</th>
            <th className="p-1 text-left">发放人</th>
            <th className="p-1 text-left">见证人</th>
            <th className="p-1 text-left">已签名</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-1">{r.date}</td>
              <td className="p-1">{r.reagentName}</td>
              <td className="p-1">{r.batchNo}</td>
              <td className="p-1">{r.controlType ?? '-'}</td>
              <td className="p-1">{r.applicant}</td>
              <td className="p-1">{r.projectRef}</td>
              <td className="p-1">{r.actualQty} {r.unit}</td>
              <td className="p-1">{r.issuer}</td>
              <td className="p-1">{r.witness}</td>
              <td className="p-1">{r.signed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="font-semibold mb-2">历史快照</h3>
      <ul className="space-y-1">
        {snaps.map((s) => (
          <li key={s.id} className="flex gap-3 items-center">
            <span>{s.yearMonth}</span>
            <span className="text-gray-500 text-sm">lab={s.labId} rows={s.rowCount}</span>
            <button
              className="text-blue-600 underline text-sm"
              onClick={() => download(`/controlled-ledger/snapshots/${s.id}`, `${s.yearMonth}.csv`)}
            >下载</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> 注：当前 `apps/web/src/lib/api-client.ts` 里的 `BASE` 常量未导出。要让 ledger 页通过 `fetch` 下载 CSV（而非走 `apiFetch` 的 JSON 解析），需追加导出。

在 `apps/web/src/lib/api-client.ts` 顶部修改常量声明，并在文件末尾追加导出：

```ts
// 第 1 行起改为：
export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

// 然后把下方 fetch(`${BASE}...) 中的 BASE 换成 apiBaseUrl
```

即把原 `const BASE = ...` 重命名为 `export const apiBaseUrl = ...`，并同步更新 `apiFetch` 内部引用。`csvHref` 辅助函数在本页未实际使用，删除即可。

- [ ] **Step 4: 侧栏加"台账"**

修改 `apps/web/src/app/admin/layout.tsx`，在"发放"之后插入：

```tsx
          <Link href="/admin/ledger" className="block">
            台账
          </Link>
```

- [ ] **Step 5: 构建**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -20
```

Expected: build 成功，`/admin/ledger` 路由出现；无类型错误。

- [ ] **Step 6: Commit**

```bash
cd D:/Project/0417-any-demo
git add apps/web
git commit -m "feat(web): add double-witness issue UI and controlled ledger page"
```

---

## Task 10: shared 类型 + 全量回归 + tag

**Files:**
- Modify: `packages/shared/src/api-types.ts`
- Run: 全量 e2e + web 单测 + build
- Tag: `p4-complete`

- [ ] **Step 1: 追加 shared 类型**

在 `packages/shared/src/api-types.ts` 末尾追加：

```ts
export interface ControlledLedgerRow {
  date: string;
  reagentName: string;
  batchNo: string;
  hazardLevel: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
  labId: string;
}

export interface ControlledLedgerSnapshotSummary {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}
```

- [ ] **Step 2: 后端全量 e2e**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -15
```

Expected: 11 suites（health/prisma/auth/guards/audit/users/labs/reagents/stocks/requests/ledger）全 PASS；test 数 ≥ 54（37 原 + ~7 ledger + ~10 requests 增量）。

- [ ] **Step 3: 前端单测 + build**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web test 2>&1 | tail -5
pnpm --filter @app/web build 2>&1 | tail -20
```

Expected: test 2/2 PASS；build 路由清单含 `/my/requests`、`/approvals`、`/admin/issues`、`/admin/ledger` 四项。

- [ ] **Step 4: Commit shared 类型**

```bash
cd D:/Project/0417-any-demo
git add packages/shared
git commit -m "feat(shared): add ControlledLedgerRow and SnapshotSummary types"
```

- [ ] **Step 5: 打 tag**

```bash
cd D:/Project/0417-any-demo
git tag p4-complete
```

Expected: `git tag --list` 列出 `p3-complete` 与 `p4-complete`。

---

## Definition of Done（P4 验收）

- [ ] Prisma 含 `Approval.level`、`IssueRecord.witnessId/signatureDataUrl`、`ControlledLedgerSnapshot`
- [ ] `POST /requests` 对管控试剂强制校验 purpose(≥50) / projectRef / useLocation
- [ ] `POST /requests/:id/approvals` 支持 `level=1|2`；管控试剂要求 LAB_HEAD+SAFETY_OFFICER 各一条 APPROVE 才进 APPROVED；顺序/角色/跨 lab 全部正确拦截
- [ ] `POST /requests/:id/issues` 对管控试剂要求 witnessId + signatureDataUrl；witness 必须 LAB_HEAD/REAGENT_ADMIN、本 lab、≠issuer；事务内扣库存沿用 P3
- [ ] `GET /controlled-ledger` JSON/CSV 两格式；CSV 带 BOM；按 lab 隔离（非 SYS_ADMIN 强制自己 lab）；PLAIN_USER 403
- [ ] `GET /controlled-ledger/snapshots{,/:id}` 可读；`LedgerService.generateMonthly(yearMonth, labId)` upsert 快照；调用两次返回同一条记录
- [ ] `ScheduleModule.forRoot()` 在 AppModule；`@Cron('5 0 1 * *')` 注册 LedgerScheduler.monthly
- [ ] AuditLog 含 `REQUEST_APPROVE`（after.level=2 覆盖二审）、`LEDGER_EXPORT`、`LEDGER_SNAPSHOT_GENERATE`
- [ ] Web `/my/requests`、`/approvals`、`/admin/issues`、`/admin/ledger` 四页可用；admin 侧栏有"台账"
- [ ] 后端 e2e 11 suites 全绿、前端单测 2/2、web build 含 12 条路由
- [ ] Tag `p4-complete`
