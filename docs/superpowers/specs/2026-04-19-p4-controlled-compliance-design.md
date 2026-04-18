# P4 · 管控合规 Design Spec

**日期**：2026-04-19
**阶段**：M4（对应主 spec §5.2 管控试剂领用 + §6 权限矩阵）
**前置条件**：P1–P3 已完成，`p3-complete` tag 在 commit `cb1f484`。

## 1. 目标

为管控试剂（`hazardLevel=CONTROLLED` 或 `controlType != null`）实现完整合规链路：

1. 申请强校验（purpose ≥50 字、projectRef / useLocation 必填）
2. 双级审批（LAB_HEAD 一审 → SAFETY_OFFICER 二审）
3. 双人发放（issuer + witness，`witnessId != issuerId`，均为本 lab LAB_HEAD/REAGENT_ADMIN）
4. 领用人电子签名（canvas → data URI）
5. AuditLog 全量挂载
6. 管控台账查询 + CSV 导出 + 每月自动归档

## 2. 非目标

- 第三方 CA 电子签名（本期仅图片签名，对应主 spec §10 风险项）
- 签名图片上传到对象存储（本期 data URI 直接入库）
- Excel (.xlsx) 导出（本期仅 CSV；Excel 留给后续增强）
- 定时预警（每日 08:00 扫描有效期/低库存 —— 属 M5）
- 小程序端（属 M6）

## 3. 架构概览

```
Web ──► /controlled-ledger{,/snapshots{,/:id}}  ──► LedgerController
                                                         │
Web ──► /requests/:id/approvals (+level)         ──► ApprovalsController
Web ──► /requests/:id/issues (+witness+sig)      ──► IssuesController
                                                         │
                                                         ▼
                                              LedgerService ◄── LedgerScheduler @Cron
                                                         │
                                                         ▼
                                              Prisma (+ ControlledLedgerSnapshot,
                                                      Approval.level,
                                                      IssueRecord.witnessId/signatureDataUrl)
```

**判定"管控"的统一函数**：
```ts
isControlled(reagent) => reagent.hazardLevel === 'CONTROLLED' || reagent.controlType != null
```
所有业务规则分支唯一判定入口。不在 `Request` 上冗余存储。

## 4. 数据模型变更

一次 Prisma migration（`add_p4_compliance`）囊括 4 处变更：

### 4.1 `Approval` 追加字段
```prisma
model Approval {
  ...原字段
  level  Int  @default(1)    // 1=LAB_HEAD 一审, 2=SAFETY_OFFICER 二审
  @@unique([requestId, level, action])
}
```
`default(1)` 保证 P3 已存在数据兼容。唯一约束阻止同 level 重复提交。

### 4.2 `IssueRecord` 追加字段
```prisma
model IssueRecord {
  ...原字段
  witnessId         String?
  signatureDataUrl  String?  @db.Text
  witness           User?    @relation("IssueRecordWitness", fields: [witnessId], references: [id])
}
```
管控试剂发放时两个字段必填；普通试剂均可空（保持 P3 行为）。

### 4.3 `User` 追加反向关系
```prisma
model User {
  ...原字段
  witnessRecords  IssueRecord[]  @relation("IssueRecordWitness")
}
```

### 4.4 新增 `ControlledLedgerSnapshot`
```prisma
model ControlledLedgerSnapshot {
  id          String   @id @default(cuid())
  labId       String
  yearMonth   String          // "2026-04"
  csvContent  String   @db.Text
  rowCount    Int
  createdAt   DateTime @default(now())
  @@unique([labId, yearMonth])
  @@index([labId])
}
```

## 5. 业务规则

### 5.1 管控申请强校验
`POST /requests` 时，若 `isControlled(reagent)`：
- `purpose.length >= 50` 否则 400 `"purpose must be >= 50 chars for controlled reagents"`
- `projectRef` 非空否则 400
- `useLocation` 非空否则 400

普通试剂不加额外校验，沿用 P3。

### 5.2 双级审批
`ApproveRequestDto` 新增 `level?: 1 | 2`，默认 1。

| 试剂类型 | level=1 角色 | level=2 角色 | APPROVED 条件 |
|---|---|---|---|
| 普通 | LAB_HEAD（本 lab） | 禁止 | level=1 一条 APPROVE |
| 管控 | LAB_HEAD（本 lab） | SAFETY_OFFICER（本 lab） | level=1 + level=2 各一条 APPROVE |

- 任一级 REJECT 立即置 `REJECTED`，写入 `rejectedReason`（级别与批注）。
- 必须先 level=1 APPROVE，才能收 level=2；顺序颠倒返 400。
- SAFETY_OFFICER 审批普通试剂或跨 lab → 403。
- LAB_HEAD 不得提交 level=2；违反返 403。
- SYS_ADMIN 可代任何级别 APPROVE/REJECT（运维兜底）。

### 5.3 双人发放
`IssueRequestDto` 新增 `witnessId?: string`、`signatureDataUrl?: string`。

管控试剂（即发放时 `isControlled(reagent) = true`）：
- `witnessId` 必填；否则 400
- `signatureDataUrl` 必填、以 `data:image/` 开头、长度 ≤ 1 MB；否则 400
- 见证人必须：本 lab、持有 LAB_HEAD 或 REAGENT_ADMIN 角色、`witnessId !== issuerId`；任一不满足 → 400
- SAFETY_OFFICER 不得作为 witness（已做二审，角色分离）

普通试剂：两字段均可省，沿用 P3 事务扣库存逻辑。

### 5.4 台账查询
`GET /controlled-ledger?labId=&from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv`

- 权限：LAB_HEAD / REAGENT_ADMIN / SAFETY_OFFICER / SYS_ADMIN；其它角色 403
- 数据边界：非 SYS_ADMIN 强制 `labId = user.labId`（忽略 query 里的 labId）
- 数据源：`IssueRecord` join `Request.reagent`，过滤 `isControlled=true`
- `format=csv`（默认 json）返回 `Content-Type: text/csv; charset=utf-8`，带 `\uFEFF` BOM（Excel 打开中文）
- CSV 列：`date, reagentName, batchNo, controlType, applicant, projectRef, purpose, actualQty, unit, issuer, witness, signed(Y/N)`

### 5.5 台账归档
- `GET /controlled-ledger/snapshots?labId=` 列历史，按 `yearMonth` 降序
- `GET /controlled-ledger/snapshots/:id` 下载 CSV
- `LedgerScheduler` 使用 `@Cron('5 0 1 * *')` 触发；每月 1 号 00:05 遍历所有 lab → `LedgerService.generateMonthly(yearMonth, labId)` upsert 快照
- `generateMonthly` 作为公开 service 方法，测试直接调用，不依赖 cron 触发

### 5.6 AuditLog 挂点
继续用现有 `@Audit({ action, entityType })` 装饰器：

| 端点 | action |
|---|---|
| `POST /requests` | `REQUEST_CREATE` |
| `POST /requests/:id/cancel` | `REQUEST_CANCEL` |
| `POST /requests/:id/approvals` (level=1) | `REQUEST_APPROVE` |
| `POST /requests/:id/approvals` (level=2) | `REQUEST_SAFETY_APPROVE` |
| `POST /requests/:id/approvals` (REJECT) | `REQUEST_REJECT` |
| `POST /requests/:id/issues` | `REQUEST_ISSUE` |
| `GET /controlled-ledger?format=csv` | `LEDGER_EXPORT` |
| LedgerScheduler 归档 | `LEDGER_SNAPSHOT_GENERATE`（service 内手动写 AuditLog，无 HTTP context） |

## 6. 后端模块布局

```
apps/api/src/
├─ requests/                         # P3 模块增强
│  ├─ approvals.service.ts           # 增 level 校验与双级状态推进
│  ├─ approvals.controller.ts        # 动态 audit action
│  ├─ issues.service.ts              # 增 witness/signature 校验
│  ├─ issues.controller.ts
│  └─ dto/
│     ├─ approve-request.dto.ts      # +level
│     └─ issue-request.dto.ts        # +witnessId, +signatureDataUrl
└─ ledger/                           # 新模块
   ├─ ledger.module.ts
   ├─ ledger.service.ts              # 查询 + CSV 构造 + generateMonthly
   ├─ ledger.controller.ts           # GET endpoints
   ├─ ledger.scheduler.ts            # @Cron('5 0 1 * *')
   └─ dto/query-ledger.dto.ts
```

`AppModule` imports 追加 `LedgerModule` 与 `ScheduleModule.forRoot()`。

## 7. 前端改动

| 路由 | 改动 |
|---|---|
| `/my/requests` | 选择试剂时前端通过 `/reagents/:id` 读取 `hazardLevel/controlType` —— 管控时显示红色"管控试剂"徽章、`purpose` 切为 textarea 并前端 `minLength=50`、`projectRef` 与 `useLocation` 变必填 |
| `/approvals` | 表格多一列"级别"；按钮根据登录角色：LAB_HEAD 提交 `{action, level:1}`，SAFETY_OFFICER 提交 `{action, level:2}`；SAFETY_OFFICER 登录时仅列出 level=1 已 APPROVE 的管控申请 |
| `/admin/issues` | "发放"按钮点击打开内嵌面板：若当前 request 为管控，展示见证人下拉（拉取本 lab 符合角色的用户，去掉自己）+ 嵌入 `react-signature-canvas` 签名板；提交时把 canvas `toDataURL()` 作为 `signatureDataUrl` |
| `/admin/ledger` 新增 | 月份 / `from/to` 过滤 + 预览表格 + "下载 CSV" 按钮；底部"历史快照"区列出归档月份下载链接 |
| `/admin/layout.tsx` | 侧栏追加"台账" |

前端依赖新增：`react-signature-canvas`（~10 KB，零传递依赖）。

## 8. 测试策略

沿用 Jest + supertest（后端 e2e）、vitest（前端单测）。

### 8.1 `apps/api/test/requests.e2e-spec.ts` 追加
- 管控试剂：`purpose<50` → 400（消息含 "purpose"）
- 管控试剂：缺 `projectRef` / `useLocation` → 400
- LAB_HEAD level=1 APPROVE 管控 → 状态仍 PENDING
- SAFETY_OFFICER level=2 APPROVE → APPROVED
- SAFETY_OFFICER 审普通 level=1 → 403
- LAB_HEAD 先 level=2 → 400（顺序）
- 管控发放缺 witness → 400
- 管控发放缺 signature → 400
- 管控发放 witness=issuer → 400
- 管控发放 witness 角色不符 / 跨 lab → 400
- 管控发放成功：扣库存、IssueRecord.witnessId 写入、signatureDataUrl 写入

### 8.2 `apps/api/test/ledger.e2e-spec.ts` 新增
- 非 SYS_ADMIN 跨 lab 查询强制回落到自己 lab
- PLAIN_USER 查询 → 403
- `format=json` 只含管控 IssueRecord
- `format=csv` 返回 `text/csv`，含 BOM，列数正确
- `service.generateMonthly('2026-03', 'lab-default')` 创建/upsert 快照
- `GET /controlled-ledger/snapshots` 返回历史列表按 `yearMonth desc`
- `GET /controlled-ledger/snapshots/:id` 返回 CSV

### 8.3 不做
- `@Cron` 真实触发测试（依赖系统时间，脆弱）
- 前端集成测试（延续 P3 仅做单测 + build）

## 9. 依赖

| 包 | 位置 | 用途 |
|---|---|---|
| `@nestjs/schedule` | `apps/api` | `@Cron` 装饰器与 ScheduleModule |
| `react-signature-canvas` | `apps/web` | 签名 canvas 组件 |
| `@types/react-signature-canvas` | `apps/web` devDep | 类型 |

## 10. 验收（Definition of Done）

- [ ] Prisma migration `add_p4_compliance` 合入并应用
- [ ] 管控申请三项强校验（purpose/projectRef/useLocation）全部 e2e 绿
- [ ] 双级审批按矩阵生效，SAFETY_OFFICER 不越权
- [ ] 双人发放 witness + signature 全部校验生效；扣库存逻辑延续 P3
- [ ] `GET /controlled-ledger` JSON/CSV 双格式、按 lab 隔离
- [ ] `/controlled-ledger/snapshots{,/:id}` 可读；`LedgerService.generateMonthly` 可被测试调用并 upsert
- [ ] `@Cron('5 0 1 * *')` 已注册（起进程后可见 schedule 注册日志，不做触发测试）
- [ ] 前端 `/my/requests`、`/approvals`、`/admin/issues`、`/admin/ledger` 四页可用；admin 侧栏含"台账"
- [ ] AuditLog 含所有新 action
- [ ] 后端 e2e（11 suites）+ 前端单测 + build 全绿
- [ ] tag `p4-complete`

## 11. 里程碑拆解（给 writing-plans 的输入）

1. Prisma migration + 反向关系 + enum 状态兼容
2. 管控申请强校验
3. Approvals 双级状态机（含 SAFETY_OFFICER 权限）
4. Issues 双人发放 + 签名校验
5. Ledger 模块：查询 + CSV 导出
6. Ledger 快照 + Scheduler
7. Web：申请页管控增强 + 审批页 level 区分
8. Web：发放页 witness + 签名板
9. Web：台账页 + 侧栏
10. shared 类型追加 + 全量回归 + tag
