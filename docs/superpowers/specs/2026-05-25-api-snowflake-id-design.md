# apps/api Snowflake ID 设计

## 目标

`apps/api` 新增 Snowflake ID 生成能力，并让所有单字段主键模型的新建数据显式使用 Snowflake 十进制字符串 ID。Prisma schema 本轮仍保持 `String @id @default(cuid())`，不做数据库迁移，不改变 DTO 接口，不允许客户端提交新记录主键。

## 当前 ID 创建逻辑

当前 `apps/api/prisma/schema.prisma` 中，除 `UserRole` 外，业务模型主键基本为 `String @id @default(cuid())`。生产服务层的 `create()`、事务内 `create()`、`upsert.create` 通常不显式传 `id`，因此当前新记录主键由 Prisma schema 的 `cuid()` 默认值生成。迁移 SQL 中的 `id TEXT NOT NULL` 没有数据库层默认表达式，所以这是 Prisma Client/schema 层默认值，不是数据库默认值。

`UserRole` 使用 `@@id([userId, roleId])` 复合主键，没有独立 `id` 字段，不接入 Snowflake 单主键生成。

seed 和 e2e fixture 中存在固定字符串 ID，例如固定实验室、试剂、库存 ID，用于稳定引用。本轮保留这些显式 fixture ID。

## 方案选择

采用集中式 `IdService` 注入各业务服务。

- `SnowflakeIdGenerator` 是纯算法工具，只负责按时间戳、worker ID、sequence 生成 ID。
- `IdModule` / `IdService` 负责 NestJS 集成、环境变量读取、生产环境约束和对业务服务暴露 `nextId()`。
- 各创建路径显式写入 `id: this.ids.nextId()`。

没有采用 Prisma middleware/extension，因为隐式补 ID 会让嵌套 create、复合主键和测试 fixture 更难排查。没有采用直接 import 单例，因为环境校验、测试隔离和多实例配置不如 NestJS DI 清晰。

## Snowflake 算法

新增 `apps/api/src/common/id/snowflake.ts`：

- 使用 `bigint` 组装 ID。
- 返回十进制 `string`，与当前 Prisma `String` 主键兼容。
- 默认结构为 41-bit timestamp delta、10-bit worker ID、12-bit sequence。
- `workerId` 范围为 0–1023。
- 同一毫秒内 sequence 从 0 递增，最多 4096 个 ID。
- 时间进入下一毫秒时 sequence 重置为 0。
- 同毫秒 sequence 溢出时等待下一毫秒。
- 时钟回拨时抛出 `SNOWFLAKE_CLOCK_MOVED_BACKWARD`。
- 支持注入 `now()`，用于 deterministic unit tests。

## NestJS 集成

新增 `apps/api/src/common/id/id.module.ts` 和 `apps/api/src/common/id/id.service.ts`。

`IdService` 持有一个 `SnowflakeIdGenerator` 实例，并暴露：

```ts
nextId(): string
```

`SNOWFLAKE_WORKER_ID` 规则：

- `NODE_ENV === 'production'` 时必须显式配置。
- 非生产环境缺失或空值默认使用 0。
- 任何环境中，只要配置了值，就必须是 0–1023 的整数。
- 非法值抛出 `SNOWFLAKE_WORKER_ID_INVALID`。

`IdModule` 导出 `IdService`。需要生成 ID 的模块导入 `IdModule`，服务通过构造函数注入 `IdService`。

## 覆盖范围

所有单字段主键模型的新建路径都显式传 Snowflake ID：

| 模型 | 接入点 |
| --- | --- |
| `Lab` | `labs.service.ts` 的 `lab.create()` |
| `User` | `auth.service.ts` 注册、`users.service.ts` 创建用户 |
| `Role` | 当前生产服务无创建路径，若后续新增创建路径必须走 `IdService` |
| `AuditLog` | `AuditInterceptor`、ledger/alerts 等显式审计日志创建 |
| `Reagent` | `reagents.service.ts` 的 `reagent.create()` |
| `ReagentStock` | `stocks.service.ts` 创建库存、采购入库创建库存 |
| `Request` | `requests.service.ts` 创建领用申请 |
| `Approval` | `approvals.service.ts` 创建审批记录 |
| `IssueRecord` | `issues.service.ts` 创建发放记录 |
| `ControlledLedgerSnapshot` | `ledger.service.ts` 的 `upsert.create` 分支 |
| `PurchaseRequest` | `purchases.service.ts` 创建采购申请 |
| `PurchaseBatch` | `batches.service.ts` 合并批次 |
| `PurchaseApproval` | `batches.service.ts` 创建采购审批 |
| `PurchaseReceipt` | `batches.service.ts` 采购入库创建收货记录 |
| `LabReagentConfig` | `alerts/config.service.ts` 创建配置 |
| `Notification` | `notifications.service.ts` 创建通知 |

`UserRole` 不接入，因为它没有独立主键。

## 数据流

1. HTTP 请求、定时任务或拦截器触发业务逻辑。
2. 业务服务调用 `this.ids.nextId()` 生成字符串 ID。
3. Prisma `create()` 或 `upsert.create` 显式写入 `id`。
4. Prisma 返回创建后的记录。
5. 后续外键写入继续使用返回记录的 `id`，例如采购入库创建 `ReagentStock` 后，`PurchaseReceipt.stockId` 使用 `stock.id`。
6. 响应包装、前端消费和路由仍处理字符串 ID，不需要接口形态变化。

## 错误处理

`SNOWFLAKE_WORKER_ID` 非法或生产缺失时，API 在 `IdService` 初始化阶段失败，避免多实例生产环境默默使用同一个 worker ID。

时钟回拨时，生成器抛出 `SNOWFLAKE_CLOCK_MOVED_BACKWARD`。业务创建失败并走现有异常处理。不降级到 `cuid()`，避免同一系统中混入不可解释的 ID 来源。

sequence 溢出时，生成器等待下一毫秒。正常业务流量下不应触发；测试通过注入 clock 验证该分支，不依赖真实 sleep。

## 测试策略

新增 Snowflake 算法单测：

- 返回值是 string。
- 同毫秒连续调用唯一。
- sequence 在同毫秒递增。
- 时间前进后 sequence 重置。
- worker ID 接受 0 和 1023。
- worker ID 拒绝 -1、1024、非整数和非数字。
- `SNOWFLAKE_WORKER_ID` 缺失时非生产默认 0。
- `SNOWFLAKE_WORKER_ID` 配置时可正确编码到 ID 中。
- 生产环境缺失 `SNOWFLAKE_WORKER_ID` 会失败。
- sequence overflow 等待下一毫秒。
- 时钟回拨抛错。

新增或调整 `IdService` 单测：

- 非生产缺失 worker ID 默认 0。
- 生产缺失 worker ID 抛错。
- 非法 worker ID 在任何环境都抛错。
- `nextId()` 返回数字字符串。

调整服务层测试或 e2e 覆盖关键创建路径：

- 新创建的 `Lab`、`User`、`Reagent`、`ReagentStock`、`Request`、`PurchaseRequest`、`Notification` 等返回数字字符串 ID。
- 固定 fixture ID 仍可保留，不被强制替换。
- 复合主键 `UserRole` 行为不变。

最终验证命令：

```bash
pnpm --filter @app/api test
pnpm --filter @app/api build
```

如果修改触及 e2e 覆盖点，再运行相关 e2e spec。

## 非目标

- 不修改 Prisma schema 的字段类型或默认值。
- 不迁移历史数据。
- 不把 ID 类型从 string 改成 number/bigint。
- 不允许客户端提交创建主键。
- 不替换 JWT `jti` 的 `crypto.randomUUID()`。
- 不改 seed/e2e 中用于稳定引用的固定字符串 fixture ID。
