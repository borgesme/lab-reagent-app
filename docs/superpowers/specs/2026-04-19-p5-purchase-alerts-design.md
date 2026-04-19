# P5 · 采购与预警 Design Spec

**日期**：2026-04-19
**阶段**：M5（对应主 spec §5.3 采购申请 + §5.4 库存预警 + §6 权限矩阵）
**前置条件**：P1–P4 已完成，`p4-complete` tag 已打，`packages/shared/package.json` 已修正为 `dist/index.js` 入口。

## 1. 目标

1. 采购链路：`PurchaseRequest → PurchaseBatch（人工合并）→ LAB_HEAD 审批 → REAGENT_ADMIN 入库生成新 ReagentStock`
2. 每日 07:58 定时扫描（`AlertsScheduler`），检测：
   - 有效期 ≤ 阈值窗口（默认 30 天，可按 `LabReagentConfig` 覆盖）
   - `currentQty` < `LabReagentConfig.safetyStock`（未配置则跳过此项）
   - 管控试剂两类异常：量不平 + 见证不合规
3. 扫描命中生成 `Notification` 记录（入库）+ `MailerService` stub 发送（仅日志），接收人 = 本 lab 的 LAB_HEAD + REAGENT_ADMIN 各 1 条
4. 站内消息列表 / 未读 / 标记已读三条 API，Web 端右上角铃铛轮询
5. 实验室-试剂配置表（`LabReagentConfig`）承载 `safetyStock` + `expireWarningDays`
6. 新增采购 / 预警相关 AuditLog；shared 类型同步

## 2. 非目标

- 真实 SMTP 邮件（本期 stub，接口保留便于后续替换）
- 采购预算 / 供应商管理 / PO 编号（链下完成，系统不跟）
- 采购入库时对既有批次的合并（每次 Receipt 固定生成一条新 `ReagentStock`）
- 小程序端通知 / 订阅消息（M6）
- 统计报表（M7）

## 3. 架构概览

```
Web ──► /purchases{, /mine, /batches, /batches/:id/...}   ──► PurchasesController
Web ──► /lab-reagent-configs                               ──► AlertsController
Web ──► /notifications{, /:id/read, /read-all}             ──► NotificationsController

apps/api/src/
├── purchases/
│   ├── purchases.service.ts       # Request CRUD
│   ├── batches.service.ts         # 合并 / 审批 / 入库事务
│   ├── receipts.service.ts        # 入库事务专用（可折进 batches.service 若<150行）
│   ├── purchases.controller.ts
│   ├── purchases.module.ts
│   └── dto/
├── alerts/
│   ├── config.service.ts          # LabReagentConfig CRUD
│   ├── alerts.service.ts          # runDaily() 对外暴露可测
│   ├── alerts.scheduler.ts        # @Cron('58 7 * * *') → alerts.service.runDaily()
│   ├── alerts.controller.ts
│   ├── alerts.module.ts
│   └── dto/
└── notifications/
    ├── notifications.service.ts   # create / createIfAbsent / list / markRead
    ├── mailer.service.ts          # send(to, subject, body) → logger.log
    ├── notifications.controller.ts
    ├── notifications.module.ts
    └── dto/
```

**依赖方向**：`alerts → notifications`，`purchases → notifications`，`notifications` 无下游模块依赖。
**AppModule** 在 P4 已引入 `ScheduleModule.forRoot()`，继续复用。

**Web 端新增**：
- `/my/purchases`：本人发起 + 列表
- `/admin/purchases`：PENDING 聚合 + 勾选合并 + 进 Batch 详情入库
- `/approvals/purchases`：LAB_HEAD 批次审批
- `/admin/alerts/config`：`LabReagentConfig` CRUD
- 全局 `<NotificationBell />`：轮询 60s，点开展示未读列表

## 4. 数据模型

### 4.1 新增 model

```prisma
model PurchaseRequest {
  id          String   @id @default(cuid())
  applicantId String
  labId       String
  reagentId   String
  quantity    Decimal  @db.Decimal(12,3)
  unit        String
  reason      String
  status      PurchaseRequestStatus @default(PENDING)
  batchId     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  applicant User           @relation("PurchaseApplicant", fields: [applicantId], references: [id])
  lab       Lab            @relation(fields: [labId], references: [id])
  reagent   Reagent        @relation(fields: [reagentId], references: [id])
  batch     PurchaseBatch? @relation(fields: [batchId], references: [id])

  @@index([labId, status])
  @@index([batchId])
}

model PurchaseBatch {
  id             String @id @default(cuid())
  labId          String
  reagentId      String
  totalQty       Decimal @db.Decimal(12,3)
  unit           String
  status         PurchaseBatchStatus @default(PENDING)
  rejectedReason String?
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

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
  purchasePrice Decimal? @db.Decimal(12,2)

  batch    PurchaseBatch @relation(fields: [batchId], references: [id])
  stock    ReagentStock  @relation(fields: [stockId], references: [id])
  receiver User          @relation("PurchaseReceiver", fields: [receivedBy], references: [id])
}

model LabReagentConfig {
  id                String   @id @default(cuid())
  labId             String
  reagentId         String
  safetyStock       Decimal  @db.Decimal(12,3)
  expireWarningDays Int      @default(30)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  lab     Lab     @relation(fields: [labId], references: [id])
  reagent Reagent @relation(fields: [reagentId], references: [id])

  @@unique([labId, reagentId])
  @@index([labId])
}

model Notification {
  id          String             @id @default(cuid())
  recipientId String
  labId       String?
  type        NotificationType
  title       String
  body        String
  payload     Json?
  readAt      DateTime?
  emailedAt   DateTime?
  createdAt   DateTime           @default(now())

  recipient User @relation("NotificationRecipient", fields: [recipientId], references: [id])

  @@index([recipientId, readAt])
  @@index([labId, type])
}

enum PurchaseRequestStatus { PENDING MERGED CANCELLED }
enum PurchaseBatchStatus   { PENDING APPROVED REJECTED RECEIVED CANCELLED }
enum NotificationType {
  ALERT_EXPIRING
  ALERT_LOW_STOCK
  ALERT_RECONCILE
  PURCHASE_APPROVED
  PURCHASE_REJECTED
  PURCHASE_RECEIVED
}
```

### 4.2 既有 model 补充关系

在 `User`、`Lab`、`Reagent`、`ReagentStock` 上补反向关系字段（名称见上 `@relation` 标注）。不新增字段。

### 4.3 `AuditLog` 新 action

| action | 触发点 |
|---|---|
| `PURCHASE_CREATE` | POST /purchases |
| `PURCHASE_BATCH_CREATE` | POST /purchases/batches |
| `PURCHASE_BATCH_APPROVE` | POST /purchases/batches/:id/approve（APPROVE 或 REJECT） |
| `PURCHASE_RECEIVE` | POST /purchases/batches/:id/receipt |
| `LAB_REAGENT_CONFIG_UPSERT` | POST / PATCH /lab-reagent-configs |
| `ALERT_SCAN` | AlertsService.runDaily() 完成时，entityId=scanId，payload={counts} |

## 5. 业务流程

### 5.1 采购

```
POST /purchases                       → PurchaseRequest(PENDING)
POST /purchases/batches {requestIds}  → 事务：
                                          validate(同 lab/reagent/unit/全 PENDING)
                                          totalQty = Σ items.quantity
                                          create PurchaseBatch(PENDING)
                                          update items: status=MERGED, batchId
POST /purchases/batches/:id/approve   → 事务：
  {action: APPROVE}                     create PurchaseApproval
                                        set batch.status=APPROVED
                                        notify REAGENT_ADMIN (PURCHASE_APPROVED)
  {action: REJECT, comment}             create PurchaseApproval
                                        set batch.status=REJECTED, rejectedReason=comment
                                        revert items: status=PENDING, batchId=null
                                        notify applicants (PURCHASE_REJECTED)
POST /purchases/batches/:id/receipt   → 事务：
  {supplier, purchasePrice, batchNo,    create ReagentStock {
   mfgDate, expireDate, location,         reagentId = batch.reagentId, labId = batch.labId,
   actualQty}                             unit = batch.unit,
                                          initialQty = currentQty = actualQty,
                                          batchNo/mfgDate/expireDate/location/
                                          supplier/purchasePrice = DTO 字段
                                        }
                                        create PurchaseReceipt(batchId, stockId, ...)
                                        set batch.status=RECEIVED
                                      事务后：notify applicants (PURCHASE_RECEIVED)
```

### 5.2 每日预警

```
@Cron('58 7 * * *')  → alerts.service.runDaily()
  forEach lab ∈ all labs:
    try:
      lowStock      = stocks WHERE labId=lab AND deletedAt=null
                      AND exists LabReagentConfig(lab, reagent, safetyStock)
                      AND currentQty < safetyStock
      expiring      = stocks WHERE labId=lab AND deletedAt=null
                      AND expireDate ≤ now + (config.expireWarningDays || 30) days
      qtyAnomaly    = reagents WHERE is controlled AND
                      sum(initialQty across stocks in lab) - sum(actualQty issued in lab)
                      ≠ sum(currentQty across stocks in lab)
      witnessAnomaly= IssueRecord.createdAt ≥ 本月 1 号 AND request.reagent controlled AND
                      (witnessId=null OR witnessId=issuerId OR signatureDataUrl null/""）
      if any findings:
        recipients = users in lab with role LAB_HEAD or REAGENT_ADMIN (去重)
        forEach recipient × finding type:
          notifications.createIfAbsent(recipientId, type, payload)
          mailer.send(recipient.email, subject, body) → emailedAt=now
      Audit(ALERT_SCAN, labId, counts)
    catch e: logger.error(lab=..., err=e)
```

### 5.3 站内消息

- `GET /notifications?unreadOnly=true&limit=50` 仅返回 `recipientId=self`
- `POST /notifications/:id/read` 设 `readAt`；非本人 403
- `POST /notifications/read-all` 批量设 readAt

## 6. 权限矩阵（增量）

| 动作 | PLAIN_USER | LAB_HEAD | REAGENT_ADMIN | SAFETY_OFFICER | SYS_ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| POST /purchases | ✅ | ✅ | ✅ | — | — |
| GET /purchases/mine | ✅ | ✅ | ✅ | — | — |
| GET /purchases?labId=（本 lab） | — | ✅ | ✅ | — | ✅ |
| POST /purchases/batches | — | — | ✅ | — | — |
| POST /purchases/batches/:id/approve | — | ✅（本 lab） | — | — | ✅ |
| POST /purchases/batches/:id/receipt | — | — | ✅ | — | — |
| POST / PATCH /lab-reagent-configs | — | ✅ | ✅ | — | ✅ |
| GET /notifications（本人） | ✅ | ✅ | ✅ | ✅ | ✅ |

数据边界始终按 `labId` 过滤；SYS_ADMIN 不受 labId 限制。

## 7. 错误处理

| 场景 | 状态码 | message |
|---|:-:|---|
| 资源不存在 | 404 | `purchase request not found` / `batch not found` / `config not found` / `notification not found` |
| 非本 lab / 非本人 | 403 | `forbidden` |
| 合并时 requestIds 空 / 跨 lab / 跨 reagent / 跨 unit | 400 | `merge requires same lab/reagent/unit` |
| 合并含非 PENDING 项 | 409 | `request not pending` |
| 审批非 PENDING 批次 | 409 | `batch not pending` |
| 入库非 APPROVED 批次 | 409 | `batch not approved` |
| Receipt 重复 | 409 | `receipt already recorded`（`PurchaseReceipt.batchId @unique`） |
| LabReagentConfig 重复 | 409 | `config exists`（`@@unique([labId, reagentId])`） |
| DTO 校验失败 | 400 | class-validator |

**事务与通知顺序**：所有创建 Notification 的步骤必须在数据库事务 **commit 之后** 触发；如事务回滚，不发任何消息。`mailer.send()` 异常被 try/catch 吞掉（记 logger.warn），不阻断业务。

**Scheduler 容错**：单 lab 处理用 try/catch 包裹，失败写 `logger.error` 不影响其余 lab；同日同键 Notification 用 `createIfAbsent` 去重（查当天 00:00 之后 `recipientId + type + payload->>reagentId/stockId` 相同且 `readAt is null` 的记录，存在则跳过）。

## 8. 测试策略

**TDD**：先写 Jest e2e，后写实现。`test/jest-e2e.json` 继续 `maxWorkers: 1`。

新增测试文件：
- `apps/api/test/purchases.e2e-spec.ts` ~22 例
- `apps/api/test/alerts.e2e-spec.ts` ~12 例
- `apps/api/test/notifications.e2e-spec.ts` ~8 例

关键用例：
- 合并：空/跨 lab/跨 reagent/跨 unit/含非 PENDING/成功路径
- 审批 REJECT 的 items 回滚
- Receipt 入库后 `/stocks?labId=` 能查到新批次
- Scheduler 通过直接调 `AlertsService.runDaily()` 测试，不等 cron
- Notification 幂等：两次 runDaily 不重复生成
- 无 `LabReagentConfig` 跳过 lowStock 但继续 expiring/reconcile

**前端**：不写 unit test，依赖 `pnpm --filter @app/web build` 类型检查 + 手工回归。

**shared 类型同步**：`packages/shared/src/api-types.ts` 新增：
```ts
PurchaseRequestSummary, PurchaseBatchSummary, PurchaseReceiptSummary,
LabReagentConfigSummary, NotificationSummary, NotificationType
```
改后 `pnpm --filter @app/shared build`。

## 9. 交付清单

- [ ] Prisma 迁移：新 6 个 model + 3 个 enum + 既有表反向关系字段
- [ ] `apps/api/src/purchases/**`（service + controller + dto + module + e2e）
- [ ] `apps/api/src/alerts/**`（service + scheduler + controller + dto + module + e2e）
- [ ] `apps/api/src/notifications/**`（service + mailer + controller + module + e2e）
- [ ] `apps/api/src/app.module.ts` 挂载三新模块
- [ ] `packages/shared/src/api-types.ts` 新类型 + `dist` 重新 build
- [ ] Web：`/my/purchases` / `/admin/purchases` / `/approvals/purchases` / `/admin/alerts/config` + `<NotificationBell/>`
- [ ] `/admin/layout.tsx` 增加导航入口
- [ ] 全量回归：`pnpm --filter @app/api test:e2e` 全绿，`pnpm --filter @app/web build` 通过
- [ ] Tag `p5-complete`

## 10. 风险与已知限制

- Mailer stub 的 `emailedAt` 只代表调用被触发，不代表真实发送；未来替换 nodemailer 时需引入状态机（QUEUED/SENT/FAILED）
- 幂等策略按"当天未读"去重；如果 LAB_HEAD 连续两天都没读，第 2 天仍会生成新条目（需求符合）
- 对账异常定义较粗：仅以"本月见证记录 + 累计量差"为准，不对单笔历史做追溯；后续可扩展成按批次时间窗精确比对
- `PurchaseReceipt` 一次只生成 1 个 ReagentStock；如果实际到货分多批次抵达，需多次入库（等于多次 Receipt，但 `batchId @unique` 限制只能一次），这是已知约束——走 `PurchaseBatch.status=CANCELLED` + 重开批次流程

## 11. 里程碑

| 任务组 | 预估 |
|---|---|
| 1. Prisma schema + migrate | 0.5d |
| 2. Notifications + Mailer 模块 + e2e | 0.5d |
| 3. Purchases 模块 + e2e（request/batch/approve/receipt） | 1.5d |
| 4. Alerts 模块 + Scheduler + e2e | 1d |
| 5. shared 类型同步 | 0.1d |
| 6. Web 4 个页面 + NotificationBell | 1d |
| 7. 全量回归 + tag | 0.4d |
| **合计** | **~5d** |
