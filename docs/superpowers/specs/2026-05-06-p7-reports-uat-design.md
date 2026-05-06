# P7 设计:报表中心 + 自动化联调

- **日期:** 2026-05-06
- **范围对齐:** 主设计文档 M7「统计报表 + UAT」
- **前置:** P6 已完成(tag `p6-complete`),小程序 H5/weapp 双端 build 通过,API e2e 95 tests 全绿,Web build 16 routes 通过
- **方案:** A · 薄做透(实时 SQL 聚合 + recharts + 独立 reports module + Playwright)

## 1. 范围

P7 落地两件事:

1. **报表中心**:在 Web 端提供 4 个维度的统计报表,Taro 小程序提供简版 KPI 概览
2. **自动化联调**:用 Playwright 跑核心业务路径的端到端测试,覆盖 Web 与 Taro H5

显式排除:

- PDF 导出(成本高,实验室场景需求弱)
- 真机/微信开发者工具走查(demo 阶段无 AppID,改为 Taro H5 + Playwright)
- materialized view / 预聚合 / Redis 缓存(YAGNI,数据量未达瓶颈)
- 不新建数据库表(全部基于现有模型聚合)

## 2. 报表维度与权限矩阵

报表维度全要 4 个;权限按 `RoleCode` enum 5 角色分范围。

| 报表 \ 角色      | PLAIN_USER       | LAB_HEAD       | REAGENT_ADMIN | SAFETY_OFFICER | SYS_ADMIN |
| ---------------- | ---------------- | -------------- | ------------- | -------------- | --------- |
| 领用趋势         | 仅本人(`userId=me`) | 本实验室 | 全院          | 全院           | 全院      |
| 库存周转         | 403           | 本实验室       | 全院          | 403         | 全院      |
| 采购金额         | 403           | 本实验室       | 全院          | 403         | 全院      |
| 管控试剂审计     | 403           | 本实验室       | 全院          | 全院           | 全院      |

数据源映射:

| 报表 | Prisma 模型 | 关键聚合 |
| --- | --- | --- |
| 领用趋势 | `IssueRecord` | group by 时间桶 + `reagentId`,sum(`actualQty`) |
| 库存周转 | `ReagentStock` + `IssueRecord` | 周转天数 = 平均库存 / 日均出库 |
| 采购金额 | `PurchaseBatch` + `PurchaseReceipt` | sum(`PurchaseReceipt.purchasePrice`) by month/category/supplier;未到货批次单独统计 |
| 管控试剂审计 | `ControlledLedgerSnapshot` + `AuditLog` (`entityType` 前缀 `Controlled`) | 时间倒序明细行 |

约定:

- 所有金额字段为 Prisma `Decimal(12,2)` 元(`PurchaseReceipt.purchasePrice` / `ReagentStock.purchasePrice`),**不是 cents**;service 中以 `Decimal` 流转,JSON 序列化时 `.toFixed(2)`,csv/xlsx 直接写字符串
- 时间窗最大 365 天(超出 → `400 REPORT_RANGE_TOO_WIDE`),防止扫表
- 单次返回行数硬封顶 10000(超出 → `400 REPORT_TOO_LARGE`)

## 3. 整体架构

### 3.1 后端:`apps/api/src/reports/`

```
reports.module.ts             ReportsModule(注册 4 controller + 4 service + ScopeGuard)
guards/report-scope.guard.ts  装饰器 @ReportScope(reportType) 触发,从 JWT 取 user → 注入 req.reportScope
dto/
  report-query.dto.ts         共享: range / startDate / endDate / format / summary / labId
  usage-trend.dto.ts          特化: groupBy=day|week|month, reagentId?
  inventory-turnover.dto.ts   特化: labId?
  purchase-amount.dto.ts      特化: groupBy=month|category|supplier
  controlled-audit.dto.ts     特化: reagentId?, actorId?
exporters/
  csv.exporter.ts             csv-stringify/sync + UTF-8 BOM
  xlsx.exporter.ts            exceljs writeBuffer,sheet1 明细 + sheet2 summary
reports.types.ts              共享 Response 类型,re-export 到 @app/shared
{usage-trend,inventory-turnover,purchase-amount,controlled-audit}.controller.ts + .service.ts
```

**边界约束**:`reports` module 仅依赖 `PrismaService`,不 import 其他业务 module 的 service,保持读侧隔离。

### 3.2 前端 Web:`apps/web/src/app/reports/`

(沿用现有惯例:不用 route group,layout 内手动包 `<RequireAuth>`,与 `/admin/layout.tsx` 一致)

```
layout.tsx                 <RequireAuth> + 二级 aside(4 报表 tab) + 顶栏(DateRangePicker + ExportButton)
                           按 §2 权限矩阵隐藏 tab(无权限的 tab 不渲染)
{usage-trend,inventory-turnover,purchase-amount,controlled-audit}/page.tsx
_components/
  DateRangePicker.tsx      预设(30d/90d/365d/本月/本季) + 自定义区间
  KpiCard.tsx              数值卡:label + 大数字 + 环比小字
                           「环比」= 当前窗口 vs 紧邻的上一相同长度窗口的百分比变化
                           (如 range=30d 时与前 30 天对比;range=custom 时不显示环比)
  ChartCard.tsx            recharts 容器,封装空态/加载态/错态
  ExportButton.tsx         下拉 CSV/Excel,触发 <a href={endpoint}?format=...>
  useReportData.ts         自定义 hook (useState + useEffect + apiFetch),
                           不引入 SWR(与 Web 现有数据获取模式对齐 YAGNI);
                           内部 useEffect 依赖 [type, range, startDate, endDate, ...specific]
```

布局沿用 `/admin/layout.tsx` 的 `<aside class="w-48 bg-gray-100"> + <main>` 结构,保持视觉一致。

### 3.3 前端小程序:`apps/miniapp/src/pages/report-summary/`

```
index.tsx          单页,垂直堆叠 3 张 KpiCard
                   领用趋势 7 天 / 库存低位数 / 本月采购金额
                   按 §2 权限矩阵显隐(PLAIN_USER 仅显示领用)
                   并行调 3 个 endpoint?summary=1
                   骨架屏加载态 + 失败时显示「点击重试」按钮(重新发起请求,不退出页)
index.config.ts    Taro 页面配置
```

**入口**:`apps/miniapp/src/pages/home/index.tsx` 工作台首页加一个「报表概览」卡片(可点击进 report-summary)。**不改 `app.config.ts` 的 tabBar**(已有 4 项:工作台/申请/审批/消息,且报表是低频功能)。

不引入图表库,仅显示数字 + 简文案。

### 3.4 测试:`tests/e2e/`

```
playwright.config.ts          根目录,2 个 project
                              - web      : baseURL=http://localhost:3000
                              - miniapp-h5: baseURL=http://localhost:10086
fixtures/auth.ts              3 个角色(PLAIN_USER/LAB_HEAD/SYS_ADMIN)的 storageState
reports.spec.ts               §5.3 覆盖路径 5、6
workflows.spec.ts             §5.3 覆盖路径 1-4
miniapp-h5.spec.ts            登录 + report-summary 渲染断言
```

`pnpm test:e2e` 串联,失败上传 `test-results/*/trace.zip`。

## 4. API 契约

共享基线 `ReportQueryDto`:

```ts
{
  range?: '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom'  // 默认 '30d'
  startDate?: string  // ISO yyyy-MM-dd, range='custom' 时必填
  endDate?:   string
  format?: 'json' | 'csv' | 'xlsx'  // 默认 'json'
  summary?: '0' | '1'  // 默认 '0',miniapp 用 '1' 仅返回 summary 卡
}
```

| 路径 | 特化 query | JSON response |
| --- | --- | --- |
| `GET /api/v1/reports/usage-trend` | `groupBy=day\|week\|month` (默认 day), `reagentId?` | `{ summary: { totalIssued, distinctReagents, avgDailyIssued }, series: [{ bucket, qty, reagentBreakdown? }] }` |
| `GET /api/v1/reports/inventory-turnover` | `labId?` | `{ summary: { avgTurnoverDays, lowStockCount }, rows: [{ reagentId, name, currentQty, avgQty, dailyOut, turnoverDays, status: 'ok'\|'low'\|'stale' }] }` |
| `GET /api/v1/reports/purchase-amount` | `groupBy=month\|category\|supplier` | `{ summary: { totalAmount, batchCount, pendingBatchCount }, series: [{ bucket, amount, batchCount }] }` (`amount`/`totalAmount` 为字符串,2 位小数元) |
| `GET /api/v1/reports/controlled-audit` | `reagentId?, actorId?` | `{ summary: { totalEvents, distinctActors }, rows: [{ ts, action, reagentName, actorName, qty, beforeQty, afterQty }] }` |

`format=csv|xlsx` 时:

- service 仍产出 JSON 结构 → exporter 把 series/rows 拍平成扁平表
- response header `Content-Disposition: attachment; filename="<reportType>-<endDate>.<ext>"`
- xlsx 文件:sheet1 = 明细 + 列宽自动 + 首行加粗冻结;sheet2 = `summary` 键值对
- csv 文件:UTF-8 BOM,Excel 中文不乱码

错误约定(沿用 `HttpExceptionFilter`):

| HTTP | Code | 触发 |
| --- | --- | --- |
| 403 | `REPORT_SCOPE_DENIED` | 角色对该报表无访问权 |
| 400 | `REPORT_RANGE_INVALID` | `range='custom'` 但缺 startDate/endDate,或 endDate < startDate |
| 400 | `REPORT_RANGE_TOO_WIDE` | 跨度 > 365 天 |
| 400 | `REPORT_TOO_LARGE` | 结果行数 > 10000 |

## 5. 共享类型

`packages/shared/src/reports.ts` 导出:

```ts
export type ReportType = 'usage-trend' | 'inventory-turnover' | 'purchase-amount' | 'controlled-audit'
export type ReportScope = 'self' | 'lab' | 'all'
export interface UsageTrendResponse { summary: {...}; series: [...] }
export interface InventoryTurnoverResponse { summary: {...}; rows: [...] }
export interface PurchaseAmountResponse { summary: {...}; series: [...] }
export interface ControlledAuditResponse { summary: {...}; rows: [...] }
export const REPORT_SCOPE_MATRIX: Record<RoleCode, Record<ReportType, ReportScope | null>>
```

`null` = 该角色对该报表 403。Web `layout.tsx` 直接读这张表决定 tab 渲染,后端 `ReportScopeGuard` 读同一张表做拦截 —— 单一信息源。

## 6. 导出实现细节

- `csv.exporter.ts`:`csv-stringify/sync` + 手动写入 UTF-8 BOM(`\ufeff`)
- `xlsx.exporter.ts`:`exceljs` 内存 workbook,`writeBuffer()` 返回 Buffer
  - sheet1 名 = 报表中文名(如「领用趋势」),首行加粗 + 冻结,列宽 `Math.min(max(content), 30)`
  - sheet2 名 =「概览」,A 列 label,B 列 value
- 流式策略:行数硬封顶 10000,无需 stream
- controller 落点:

  ```ts
  if (query.format !== 'json' && query.format !== undefined) {
    const data = await service.run(query, scope)
    const buffer = exporter.export('usage-trend', data, query.format)
    return reply.header('Content-Disposition', `attachment; filename="${filename}"`)
                .type(mime).send(buffer)
  }
  ```

## 7. E2E 测试策略

- **fixtures/auth.ts**:首次为每角色登录 → 保存 `storageState` JSON → 后续 case 读取复用,跳过登录
- **核心 6 路径**:
  1. PLAIN_USER 登录 → 检索试剂 → 提交领用申请
  2. LAB_HEAD 登录 → 看到待审批 → 通过
  3. REAGENT_ADMIN 发放领用 → 验证 `ReagentStock` 减少
  4. REAGENT_ADMIN 发起采购 → 审批 → 收货 → 验证库存增加
  5. SYS_ADMIN 进 4 个报表 → 断言 KPI 数字 > 0、`<svg>` 可见、点导出 CSV 文件下载成功
  6. PLAIN_USER 进 /reports → 断言只有「领用趋势」tab,其他 tab 不在 DOM 里
- **miniapp-h5.spec.ts**:LAB_HEAD 登录 → 进 report-summary → 断言 3 张 KpiCard 渲染数字
- **CI 配置**:`pnpm test:e2e` 同时启动 api + web + miniapp-h5 dev server,失败时上传 trace
- **不做**:weapp 真机走查、可视化回归(percy/chromatic)、压力测试

## 8. 实施里程碑

| # | Milestone | 关键产物 | 验收 |
|---|---|---|---|
| **M0** | 依赖 + 共享类型 | `recharts` / `exceljs` / `csv-stringify` 进 web/api;`@playwright/test` 进根;`@app/shared/reports.ts` | `pnpm -r build` 仍绿 |
| **M1** | reports module 骨架 | `reports.module.ts` + `ReportScopeGuard` + `ReportQueryDto` + 4 路由 stub | API e2e 95 tests 不破;`/reports/*` 返 200 空体 |
| **M2** | 领用趋势 service | Prisma `groupBy` 实现 + 单元测试 | service spec 通过;真实 series 返回 |
| **M3** | 其余 3 个 service | 库存周转 + 采购金额 + 管控审计 service | 4 endpoint 全部返真实数据 |
| **M4a** | csv exporter | `csv.exporter.ts` + 4 controller 装上 `format=csv` | 浏览器 GET `?format=csv` 下载,Excel 打开中文不乱码 |
| **M4b** | xlsx exporter | `xlsx.exporter.ts` + sheet1 明细 + sheet2 概览 | GET `?format=xlsx` 下载,Excel 打开两个 sheet 都正常 |
| **M5** | Web /reports 布局 | `layout.tsx` 二级 aside + DateRangePicker + KpiCard + ChartCard + ExportButton + useReportData | dev 跑起来,4 tab 切换,数据 mock 渲染 |
| **M6** | 4 张报表页 | recharts 折线/柱/饼,接 useReportData 真实数据,空/错/加载态 | 真实数据可视化 |
| **M7** | miniapp report-summary | 3 张 KpiCard + 角色显隐 + 重试 | Taro H5 + weapp build 通过 |
| **M8** | Playwright + 6 e2e | `playwright.config.ts` + fixtures + 3 spec 文件 | `pnpm test:e2e` 全绿 |
| **M9** | 联调收尾 | API e2e + Web e2e + miniapp 双端 build 全绿 | tag `p7-complete` |

顺序约束:M0 → M1 → M2 → M3,M4a/M4b 可与 M3 末尾并行,M5 在 M1 后启动(mock),M6 在 M5+M3 后接真实 hook,M7 与 M6 可并行,M8 必须最后。

## 9. 风险与回退

- recharts 在 Next.js 14 SSR 下 hydration 报警 → 降级 `next/dynamic` `{ ssr: false }`
- exceljs 打包体积大(~1.5MB) → 接受,不做替换;若爆内存才换 `xlsx-populate`
- Playwright weapp build 验证困难 → 退到 H5 only,不阻塞 demo
- 数据量起来后实时 SQL 慢 → 后续加 PG materialized view,**不影响 API 契约**

## 10. 不在本期范围

- 报表订阅 / 邮件推送
- 自定义报表(用户拖拽指标)
- 数据看板大屏
- 实时刷新(WebSocket / SSE)
- 多语言导出
- PDF 导出

以上若需要,作为 P8 单独开 spec。

## 11. 验收清单(P7 完成定义)

- [ ] `pnpm -r build` 全绿(api / web / miniapp 三端)
- [ ] API e2e 仍 14 suites / 95 tests 全绿
- [ ] 4 个 reports endpoint 单元测试覆盖 service 主路径
- [ ] Web `/reports` 4 个 tab 真实数据可视化
- [ ] CSV / Excel 导出在浏览器中能下载并正确打开
- [ ] miniapp `report-summary` 在 H5 + weapp build 都渲染
- [ ] Playwright 6 路径全绿
- [ ] tag `p7-complete` 推上,`memory/MEMORY.md` 更新
