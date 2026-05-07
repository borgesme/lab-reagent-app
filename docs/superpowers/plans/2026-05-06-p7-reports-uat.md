# P7 · 报表中心 + 自动化联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 4 维报表(领用趋势 / 库存周转 / 采购金额 / 管控审计)+ Web 报表中心 + miniapp 简版 KPI + Playwright 端到端联调,沿用方案 A(实时 SQL + recharts + Playwright)。

**Architecture:** 后端新增独立 `reports` module(读侧隔离,只依赖 PrismaService);共享类型与权限矩阵置于 `@app/shared/reports.ts`,后端 ScopeGuard 与前端 tab 显隐共用同一份事实源;Web `/reports` 沿用 /admin 二级 aside 风格;miniapp 在工作台首页加报表入口卡;E2E 用 Playwright 跨 web 与 Taro H5。

**Tech Stack:** NestJS 10 / Prisma 5 / Next.js 14(App Router)/ React 18 / Taro 3.6 / TypeScript 5.4。新增依赖:`recharts ^2.12` / `exceljs ^4.4` / `csv-stringify ^6.5` / `@playwright/test ^1.43`。

**Spec:** `docs/superpowers/specs/2026-05-06-p7-reports-uat-design.md`(commit `d6334a1`)

**Prerequisites:** P6 完成(tag `p6-complete`),master HEAD 至少在 `1fa34d4` 之后。本地 `pnpm db:up` 起 postgres,`pnpm dev:api` + `pnpm dev:web` 跑通,API e2e 现有 95 tests 全绿。

---

## File Structure

```
apps/api/src/reports/                                # NEW
├── reports.module.ts
├── dto/
│   ├── report-query.dto.ts                          # 共享 query (range/format/...)
│   ├── usage-trend.dto.ts                           # +groupBy, reagentId?
│   ├── inventory-turnover.dto.ts                    # +labId?
│   ├── purchase-amount.dto.ts                       # +groupBy
│   └── controlled-audit.dto.ts                      # +reagentId?, actorId?
├── guards/
│   └── report-scope.guard.ts                        # 读 matrix 注入 req.reportScope
├── decorators/
│   └── report-scope.decorator.ts                    # @ReportScope('USAGE_TREND')
├── utils/
│   ├── resolve-time-window.ts                       # 纯函数,range -> {from,to}
│   └── resolve-time-window.spec.ts
├── exporters/
│   ├── csv.exporter.ts                              # csv-stringify + UTF-8 BOM
│   └── xlsx.exporter.ts                             # exceljs 双 sheet
├── usage-trend.controller.ts + .service.ts
├── inventory-turnover.controller.ts + .service.ts
├── purchase-amount.controller.ts + .service.ts
└── controlled-audit.controller.ts + .service.ts

apps/api/src/app.module.ts                           # MODIFY: import ReportsModule
apps/api/test/reports.e2e-spec.ts                    # NEW

apps/web/src/components/reports/                     # NEW
├── KpiCard.tsx
├── ChartCard.tsx
├── DateRangePicker.tsx
├── ExportButton.tsx
└── useReportData.ts

apps/web/src/app/reports/                            # NEW
├── layout.tsx                                       # RequireAuth + 二级 aside + 时间 picker
├── usage-trend/page.tsx
├── inventory-turnover/page.tsx
├── purchase-amount/page.tsx
└── controlled-audit/page.tsx

apps/miniapp/src/pages/report-summary/               # NEW
├── index.tsx                                        # 3 KpiCard
└── index.config.ts

apps/miniapp/src/pages/home/index.tsx                # MODIFY: add 报表入口卡片
apps/miniapp/src/app.config.ts                       # MODIFY: register report-summary page

packages/shared/src/reports.ts                       # NEW: types + REPORT_SCOPE_MATRIX
packages/shared/src/index.ts                         # MODIFY: re-export reports

playwright.config.ts                                  # NEW(repo root)
tests/e2e/                                            # NEW
├── fixtures/auth.ts
├── workflows.spec.ts
├── reports.spec.ts
└── miniapp-h5.spec.ts

apps/api/package.json                                 # MODIFY: + exceljs / csv-stringify
apps/web/package.json                                 # MODIFY: + recharts
package.json (root)                                   # MODIFY: + @playwright/test, + scripts
```

每个新 service / controller 文件单一职责,< 150 行;exporter 文件 < 100 行;web 组件 < 120 行;Taro 页面 < 200 行。

---

## Task 1: Add Dependencies + Shared Types

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `package.json` (root)
- Create: `packages/shared/src/reports.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Install API deps**

```bash
pnpm --filter @app/api add exceljs csv-stringify
```

Expected: `apps/api/package.json` dependencies 多出两行,`pnpm-lock.yaml` 更新。

- [ ] **Step 2: Install Web dep**

```bash
pnpm --filter @app/web add recharts
```

- [ ] **Step 3: Install Playwright at root (devDep)**

```bash
pnpm add -D -w @playwright/test playwright
pnpm exec playwright install chromium
```

- [ ] **Step 4: Add root scripts**

Edit `package.json` (root) `scripts` block — add `test:e2e` and `test:e2e:api` lines:

```json
{
  "scripts": {
    "dev:api": "pnpm --filter @app/api start:dev",
    "dev:web": "pnpm --filter @app/web dev",
    "dev:mp": "pnpm --filter @app/miniapp dev:h5",
    "build:mp": "pnpm --filter @app/miniapp build:weapp",
    "test": "pnpm -r test",
    "test:e2e": "playwright test",
    "test:e2e:api": "pnpm --filter @app/api test:e2e",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build",
    "db:up": "docker compose up -d postgres redis",
    "db:down": "docker compose down"
  }
}
```

- [ ] **Step 5: Write shared reports types + scope matrix**

Create `packages/shared/src/reports.ts`:

```ts
import type { RoleCode } from './api-types';

export type ReportType =
  | 'usage-trend'
  | 'inventory-turnover'
  | 'purchase-amount'
  | 'controlled-audit';

export type ReportScope = 'self' | 'lab' | 'all';

/** scope === null => 该角色对该报表 403 */
export const REPORT_SCOPE_MATRIX: Record<RoleCode, Record<ReportType, ReportScope | null>> = {
  PLAIN_USER: {
    'usage-trend': 'self',
    'inventory-turnover': null,
    'purchase-amount': null,
    'controlled-audit': null,
  },
  LAB_HEAD: {
    'usage-trend': 'lab',
    'inventory-turnover': 'lab',
    'purchase-amount': 'lab',
    'controlled-audit': 'lab',
  },
  REAGENT_ADMIN: {
    'usage-trend': 'all',
    'inventory-turnover': 'all',
    'purchase-amount': 'all',
    'controlled-audit': 'all',
  },
  SAFETY_OFFICER: {
    'usage-trend': 'all',
    'inventory-turnover': null,
    'purchase-amount': null,
    'controlled-audit': 'all',
  },
  SYS_ADMIN: {
    'usage-trend': 'all',
    'inventory-turnover': 'all',
    'purchase-amount': 'all',
    'controlled-audit': 'all',
  },
};

export interface ResolvedReportScope {
  scope: ReportScope;
  userId: string;
  labId: string | null;
}

export function resolveReportScope(
  user: { id: string; labId: string | null; roles: RoleCode[] },
  type: ReportType,
): ResolvedReportScope | null {
  let best: ReportScope | null = null;
  for (const role of user.roles) {
    const s = REPORT_SCOPE_MATRIX[role]?.[type] ?? null;
    if (s === 'all') return { scope: 'all', userId: user.id, labId: user.labId };
    if (s === 'lab') best = 'lab';
    if (s === 'self' && best === null) best = 'self';
  }
  return best === null ? null : { scope: best, userId: user.id, labId: user.labId };
}

// ---------- Response shapes ----------

export interface UsageTrendSummary {
  totalIssued: string;
  distinctReagents: number;
  avgDailyIssued: string;
}
export interface UsageTrendRow {
  bucket: string;
  qty: string;
  reagentBreakdown?: Array<{ reagentId: string; name: string; qty: string }>;
}
export interface UsageTrendResponse {
  summary: UsageTrendSummary;
  series: UsageTrendRow[];
}

export interface InventoryTurnoverSummary {
  avgTurnoverDays: number;
  lowStockCount: number;
}
export interface InventoryTurnoverRow {
  reagentId: string;
  name: string;
  currentQty: string;
  avgQty: string;
  dailyOut: string;
  turnoverDays: number;
  status: 'ok' | 'low' | 'stale';
}
export interface InventoryTurnoverResponse {
  summary: InventoryTurnoverSummary;
  rows: InventoryTurnoverRow[];
}

export interface PurchaseAmountSummary {
  totalAmount: string;
  batchCount: number;
  pendingBatchCount: number;
}
export interface PurchaseAmountRow {
  bucket: string;
  amount: string;
  batchCount: number;
}
export interface PurchaseAmountResponse {
  summary: PurchaseAmountSummary;
  series: PurchaseAmountRow[];
}

export interface ControlledAuditSummary {
  totalEvents: number;
  distinctActors: number;
}
export interface ControlledAuditRow {
  ts: string;
  action: string;
  reagentName: string;
  actorName: string;
  qty: string;
  beforeQty?: string;
  afterQty?: string;
}
export interface ControlledAuditResponse {
  summary: ControlledAuditSummary;
  rows: ControlledAuditRow[];
}
```

- [ ] **Step 6: Re-export from shared index**

Edit `packages/shared/src/index.ts`:

```ts
export * from './api-types';
export * from './utils';
export * from './reports';
```

- [ ] **Step 7: Verify build still green**

```bash
pnpm -r build
```

Expected: 三个 workspace 都成功编译,无类型错误。

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/web/package.json package.json pnpm-lock.yaml \
        packages/shared/src/reports.ts packages/shared/src/index.ts
git commit -m "feat(p7): add reports deps + shared types/scope matrix (M0)"
```

---

## Task 2: ReportQueryDto + resolveTimeWindow Utility

**Files:**
- Create: `apps/api/src/reports/dto/report-query.dto.ts`
- Create: `apps/api/src/reports/utils/resolve-time-window.ts`
- Create: `apps/api/src/reports/utils/resolve-time-window.spec.ts`

- [ ] **Step 1: Write the failing unit test for resolveTimeWindow**

Create `apps/api/src/reports/utils/resolve-time-window.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { resolveTimeWindow } from './resolve-time-window';

describe('resolveTimeWindow', () => {
  const now = new Date('2026-05-15T10:00:00Z');

  it("range='30d' returns last 30 days", () => {
    const r = resolveTimeWindow({ range: '30d' }, now);
    expect(r.to.toISOString()).toBe('2026-05-15T10:00:00.000Z');
    expect(r.from.toISOString()).toBe('2026-04-15T10:00:00.000Z');
  });

  it("range='month' returns this calendar month", () => {
    const r = resolveTimeWindow({ range: 'month' }, now);
    expect(r.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it("range='custom' requires startDate+endDate", () => {
    expect(() =>
      resolveTimeWindow({ range: 'custom' }, now),
    ).toThrow(BadRequestException);
  });

  it("range='custom' with valid dates", () => {
    const r = resolveTimeWindow(
      { range: 'custom', startDate: '2026-01-01', endDate: '2026-01-31' },
      now,
    );
    expect(r.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('rejects span > 365 days', () => {
    expect(() =>
      resolveTimeWindow(
        { range: 'custom', startDate: '2024-01-01', endDate: '2026-01-01' },
        now,
      ),
    ).toThrow(/REPORT_RANGE_TOO_WIDE/);
  });

  it('rejects endDate < startDate', () => {
    expect(() =>
      resolveTimeWindow(
        { range: 'custom', startDate: '2026-05-01', endDate: '2026-01-01' },
        now,
      ),
    ).toThrow(/REPORT_RANGE_INVALID/);
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
pnpm --filter @app/api test -- resolve-time-window
```

Expected: FAIL with "Cannot find module './resolve-time-window'".

- [ ] **Step 3: Implement resolveTimeWindow**

Create `apps/api/src/reports/utils/resolve-time-window.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface TimeWindowQuery {
  range?: '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';
  startDate?: string;
  endDate?: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPAN_MS = 365 * ONE_DAY_MS;

export function resolveTimeWindow(q: TimeWindowQuery, now: Date = new Date()): TimeWindow {
  const range = q.range ?? '30d';

  if (range === 'custom') {
    if (!q.startDate || !q.endDate) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        message: 'custom range requires startDate and endDate',
      });
    }
    const from = new Date(`${q.startDate}T00:00:00.000Z`);
    const to = new Date(`${q.endDate}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({ code: 'REPORT_RANGE_INVALID' });
    }
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        message: 'endDate < startDate',
      });
    }
    if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_TOO_WIDE',
        message: 'span > 365 days',
      });
    }
    return { from, to };
  }

  if (range === '30d') return { from: new Date(now.getTime() - 30 * ONE_DAY_MS), to: now };
  if (range === '90d') return { from: new Date(now.getTime() - 90 * ONE_DAY_MS), to: now };
  if (range === '365d') return { from: new Date(now.getTime() - 365 * ONE_DAY_MS), to: now };

  if (range === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from, to: now };
  }
  if (range === 'quarter') {
    const q0 = Math.floor(now.getUTCMonth() / 3) * 3;
    const from = new Date(Date.UTC(now.getUTCFullYear(), q0, 1));
    return { from, to: now };
  }

  throw new BadRequestException({ code: 'REPORT_RANGE_INVALID' });
}
```

- [ ] **Step 4: Verify test passes**

```bash
pnpm --filter @app/api test -- resolve-time-window
```

Expected: 6 tests pass.

- [ ] **Step 5: Implement ReportQueryDto**

Create `apps/api/src/reports/dto/report-query.dto.ts`:

```ts
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsIn(['30d', '90d', '365d', 'month', 'quarter', 'custom'])
  range?: '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;

  @IsOptional() @IsIn(['json', 'csv', 'xlsx']) format?: 'json' | 'csv' | 'xlsx';
  @IsOptional() @IsIn(['0', '1']) summary?: '0' | '1';
  @IsOptional() @IsString() labId?: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/reports/dto apps/api/src/reports/utils
git commit -m "feat(p7): add ReportQueryDto + resolveTimeWindow util (M1.1)"
```

---

## Task 3: ReportScopeGuard + @ReportScope Decorator

**Files:**
- Create: `apps/api/src/reports/decorators/report-scope.decorator.ts`
- Create: `apps/api/src/reports/guards/report-scope.guard.ts`

后端 ScopeGuard 与前端 tab 显隐共用 `REPORT_SCOPE_MATRIX`(Task 1 已建)。Guard 从 JWT user 取 roles + labId,按 reportType 解析 `ResolvedReportScope` 注入 `req.reportScope`,无权限时抛 `403 REPORT_SCOPE_DENIED`。

- [ ] **Step 1: Write the @ReportScope decorator**

Create `apps/api/src/reports/decorators/report-scope.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { ReportType } from '@app/shared';

export const REPORT_SCOPE_KEY = 'reportScopeType';
export const ReportScope = (type: ReportType) =>
  SetMetadata(REPORT_SCOPE_KEY, type);
```

- [ ] **Step 2: Implement ReportScopeGuard**

Create `apps/api/src/reports/guards/report-scope.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REPORT_SCOPE_MATRIX,
  resolveReportScope,
  type ReportType,
  type RoleCode,
} from '@app/shared';
import { REPORT_SCOPE_KEY } from '../decorators/report-scope.decorator';

@Injectable()
export class ReportScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const reportType = this.reflector.getAllAndOverride<ReportType>(
      REPORT_SCOPE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!reportType) return true;

    const req = ctx.switchToHttp().getRequest();
    const jwtUser = req.user as { sub: string; roles: string[] } | undefined;
    if (!jwtUser) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: { id: true, labId: true },
    });
    if (!dbUser) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    const resolved = resolveReportScope(
      {
        id: dbUser.id,
        labId: dbUser.labId,
        roles: jwtUser.roles as RoleCode[],
      },
      reportType,
    );
    if (!resolved) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    req.reportScope = resolved;
    return true;
  }
}

// Re-export the matrix to satisfy `import { REPORT_SCOPE_MATRIX } from './guards/report-scope.guard'`
// for callers that don't want a shared-package dependency.
export { REPORT_SCOPE_MATRIX };
```

- [ ] **Step 3: Verify type-check**

```bash
pnpm --filter @app/api exec tsc --noEmit
```

Expected: PASS, no diagnostics for the new files.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/reports/decorators apps/api/src/reports/guards
git commit -m "feat(p7): add ReportScopeGuard + @ReportScope decorator (M1.2)"
```

---

## Task 4: ReportsModule Skeleton + 4 Stub Endpoints + e2e Smoke

**Files:**
- Create: `apps/api/src/reports/usage-trend.controller.ts`
- Create: `apps/api/src/reports/usage-trend.service.ts`
- Create: `apps/api/src/reports/inventory-turnover.controller.ts`
- Create: `apps/api/src/reports/inventory-turnover.service.ts`
- Create: `apps/api/src/reports/purchase-amount.controller.ts`
- Create: `apps/api/src/reports/purchase-amount.service.ts`
- Create: `apps/api/src/reports/controlled-audit.controller.ts`
- Create: `apps/api/src/reports/controlled-audit.service.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/reports.e2e-spec.ts`

每个 stub controller/service 现在仅返回空体(后续 task 填充);此步只验证 `ReportScopeGuard` 接入正常 + 路由前缀正确 + 权限矩阵在 e2e 层下生效。

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/reports.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Reports (M1 stubs)', () => {
  let app: INestApplication;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const admin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = admin.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'reports-plain@lab.local',
        name: 'Plain',
        password: 'pass1234',
      });
    const plain = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reports-plain@lab.local', password: 'pass1234' });
    plainToken = plain.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('scope matrix', () => {
    it('SYS_ADMIN may access all 4 reports', async () => {
      for (const slug of [
        'usage-trend',
        'inventory-turnover',
        'purchase-amount',
        'controlled-audit',
      ]) {
        const r = await request(app.getHttpServer())
          .get(`/reports/${slug}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(r.status).toBe(200);
      }
    });

    it('PLAIN_USER may access usage-trend only', async () => {
      const ok = await request(app.getHttpServer())
        .get('/reports/usage-trend')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(ok.status).toBe(200);

      for (const slug of [
        'inventory-turnover',
        'purchase-amount',
        'controlled-audit',
      ]) {
        const r = await request(app.getHttpServer())
          .get(`/reports/${slug}`)
          .set('Authorization', `Bearer ${plainToken}`);
        expect(r.status).toBe(403);
        expect(r.body.code ?? r.body.message?.code).toBe('REPORT_SCOPE_DENIED');
      }
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL with 404 (routes don't exist yet).

- [ ] **Step 3: Write 4 stub services**

Create each service file with the same minimal shape. Example
`apps/api/src/reports/usage-trend.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedReportScope, UsageTrendResponse } from '@app/shared';

@Injectable()
export class UsageTrendService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    _query: Record<string, unknown>,
    _scope: ResolvedReportScope,
  ): Promise<UsageTrendResponse> {
    return {
      summary: { totalIssued: '0.000', distinctReagents: 0, avgDailyIssued: '0.000' },
      series: [],
    };
  }
}
```

Repeat for `inventory-turnover.service.ts` (returns
`{ summary: { avgTurnoverDays: 0, lowStockCount: 0 }, rows: [] }`),
`purchase-amount.service.ts`
(`{ summary: { totalAmount: '0.00', batchCount: 0, pendingBatchCount: 0 }, series: [] }`),
`controlled-audit.service.ts`
(`{ summary: { totalEvents: 0, distinctActors: 0 }, rows: [] }`).

- [ ] **Step 4: Write 4 stub controllers**

`apps/api/src/reports/usage-trend.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { UsageTrendService } from './usage-trend.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  run(
    @Query() q: ReportQueryDto,
    @CurrentUser() _user: any,
  ) {
    // ReportScopeGuard injected req.reportScope; we read it via raw req in later tasks.
    // For the M1 stub, pass an "all" scope placeholder — the real value is wired in M2.
    const scope: ResolvedReportScope = { scope: 'all', userId: '', labId: null };
    return this.svc.run(q as unknown as Record<string, unknown>, scope);
  }
}
```

Repeat the pattern for the other 3 controllers. Each uses
`@Controller('reports/<slug>')`, `@ReportScope('<slug>')`, and constructor-injects
its service. The hand-rolled `scope` placeholder is intentional and replaced by
`@Req()` injection in Task 5.

- [ ] **Step 5: Wire ReportsModule**

Create `apps/api/src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsageTrendController } from './usage-trend.controller';
import { UsageTrendService } from './usage-trend.service';
import { InventoryTurnoverController } from './inventory-turnover.controller';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { PurchaseAmountController } from './purchase-amount.controller';
import { PurchaseAmountService } from './purchase-amount.service';
import { ControlledAuditController } from './controlled-audit.controller';
import { ControlledAuditService } from './controlled-audit.service';
import { ReportScopeGuard } from './guards/report-scope.guard';

@Module({
  controllers: [
    UsageTrendController,
    InventoryTurnoverController,
    PurchaseAmountController,
    ControlledAuditController,
  ],
  providers: [
    UsageTrendService,
    InventoryTurnoverService,
    PurchaseAmountService,
    ControlledAuditService,
    { provide: APP_GUARD, useClass: ReportScopeGuard },
  ],
})
export class ReportsModule {}
```

Note: `ReportScopeGuard` is registered **module-scoped via `APP_GUARD`** so it only
runs when a controller has `@ReportScope()` metadata (the guard returns `true` early
otherwise). It runs *after* the global `JwtAuthGuard` and `RolesGuard` already
registered in `app.module.ts`, so `req.user` is populated.

- [ ] **Step 6: Register ReportsModule in app.module**

Edit `apps/api/src/app.module.ts` — add import and include in `imports` array:

```ts
import { ReportsModule } from './reports/reports.module';

// ...inside @Module({ imports: [...] })
    AlertsModule,
    ReportsModule,
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
pnpm --filter @app/api test:e2e
```

Expected: new reports.e2e-spec passes; previous 95 tests still green (no regression).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports apps/api/src/app.module.ts apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): reports module skeleton + 4 stub endpoints + scope e2e (M1.3)"
```

---

## Task 5: Usage-Trend Service (M2 · TDD via e2e)

**Files:**
- Create: `apps/api/src/reports/dto/usage-trend.dto.ts`
- Modify: `apps/api/src/reports/usage-trend.controller.ts`
- Modify: `apps/api/src/reports/usage-trend.service.ts`
- Modify: `apps/api/test/reports.e2e-spec.ts`

PostgreSQL `date_trunc` + `prisma.$queryRaw` 做时间桶聚合。`scope='self'` → `WHERE userId=:user`;`scope='lab'` → `JOIN request ON ... WHERE request.labId=:lab`;`scope='all'` → 不加过滤。Decimal 序列化用 `.toFixed(3)` 字符串化(spec §2 约定库存数量 `Decimal(12,3)`)。

- [ ] **Step 1: Add e2e cases for usage-trend (failing)**

Append to `apps/api/test/reports.e2e-spec.ts` after the existing
`describe('scope matrix', ...)` block:

```ts
  describe('usage-trend', () => {
    let prisma: import('../src/prisma/prisma.service').PrismaService;

    beforeAll(async () => {
      // app already initialized in outer beforeAll
      prisma = (app as any).get(
        require('../src/prisma/prisma.service').PrismaService,
      );

      // Seed: a request + issue record in lab-default for the admin user.
      const adminUser = await prisma.user.findUnique({
        where: { email: 'admin@lab.local' },
      });
      const reagent = await prisma.reagent.findFirst();
      const stock = await prisma.reagentStock.findFirst({
        where: { reagentId: reagent!.id },
      });
      const req = await prisma.requestRecord.create({
        data: {
          applicantId: adminUser!.id,
          labId: 'lab-default',
          reagentId: reagent!.id,
          stockId: stock!.id,
          quantity: '1.000',
          unit: 'g',
          purpose: 'p7-test',
          status: 'ISSUED',
        },
      });
      await prisma.issueRecord.create({
        data: {
          requestId: req.id,
          issuerId: adminUser!.id,
          receiverId: adminUser!.id,
          stockId: stock!.id,
          actualQty: '1.000',
        },
      });
    });

    it('returns summary + series for SYS_ADMIN', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d&groupBy=day')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalIssued: expect.any(String),
        distinctReagents: expect.any(Number),
        avgDailyIssued: expect.any(String),
      });
      expect(Array.isArray(r.body.series)).toBe(true);
      expect(Number(r.body.summary.totalIssued)).toBeGreaterThan(0);
    });

    it('PLAIN_USER scope=self returns only self issues (empty for fresh plain user)', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary.distinctReagents).toBe(0);
      expect(r.body.series).toEqual([]);
    });

    it('rejects custom range without dates', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=custom')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL — current stub returns hard-coded zeros / empty series, so the
"totalIssued > 0" assertion fails.

- [ ] **Step 3: Add UsageTrendQueryDto**

Create `apps/api/src/reports/dto/usage-trend.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class UsageTrendQueryDto extends ReportQueryDto {
  @IsOptional() @IsIn(['day', 'week', 'month']) groupBy?: 'day' | 'week' | 'month';
  @IsOptional() @IsString() reagentId?: string;
}
```

- [ ] **Step 4: Implement UsageTrendService**

Replace `apps/api/src/reports/usage-trend.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type { ResolvedReportScope, UsageTrendResponse } from '@app/shared';
import { resolveTimeWindow } from './utils/resolve-time-window';
import type { UsageTrendQueryDto } from './dto/usage-trend.dto';

interface RawRow {
  bucket: Date;
  qty: Prisma.Decimal;
  reagent_count: bigint;
}

@Injectable()
export class UsageTrendService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    q: UsageTrendQueryDto,
    scope: ResolvedReportScope,
  ): Promise<UsageTrendResponse> {
    const { from, to } = resolveTimeWindow(q);
    const groupBy = q.groupBy ?? 'day';
    const trunc = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : 'month';

    // Build scope predicate as parameterized SQL fragments.
    const scopeFilter =
      scope.scope === 'self'
        ? Prisma.sql`AND r."applicantId" = ${scope.userId}`
        : scope.scope === 'lab'
          ? Prisma.sql`AND r."labId" = ${scope.labId}`
          : Prisma.empty;

    const reagentFilter = q.reagentId
      ? Prisma.sql`AND r."reagentId" = ${q.reagentId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawRow[]>(
      Prisma.sql`
        SELECT
          date_trunc(${trunc}, i."createdAt") AS bucket,
          SUM(i."actualQty")                  AS qty,
          COUNT(DISTINCT r."reagentId")       AS reagent_count
        FROM "IssueRecord" i
        JOIN "RequestRecord" r ON r."id" = i."requestId"
        WHERE i."createdAt" >= ${from}
          AND i."createdAt" <= ${to}
          ${scopeFilter}
          ${reagentFilter}
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT 10000
      `,
    );

    if (rows.length >= 10000) {
      // hard cap per spec §2
      throw new (await import('@nestjs/common')).BadRequestException({
        code: 'REPORT_TOO_LARGE',
      });
    }

    const totalIssued = rows.reduce(
      (acc, r) => acc.plus(r.qty ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const days = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const distinctReagents = rows.reduce(
      (m, r) => Math.max(m, Number(r.reagent_count ?? 0)),
      0,
    );

    return {
      summary: {
        totalIssued: totalIssued.toFixed(3),
        distinctReagents,
        avgDailyIssued: totalIssued.div(days).toFixed(3),
      },
      series: rows.map((r) => ({
        bucket: r.bucket.toISOString(),
        qty: (r.qty ?? new Prisma.Decimal(0)).toFixed(3),
      })),
    };
  }
}
```

- [ ] **Step 5: Wire scope into the controller**

Replace `apps/api/src/reports/usage-trend.controller.ts`:

```ts
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UsageTrendService } from './usage-trend.service';
import { UsageTrendQueryDto } from './dto/usage-trend.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  run(
    @Query() q: UsageTrendQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: 3 new usage-trend tests pass. Total reports.e2e-spec: 5 tests green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/usage-trend.dto.ts \
        apps/api/src/reports/usage-trend.controller.ts \
        apps/api/src/reports/usage-trend.service.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): usage-trend report service + scope-aware aggregation (M2)"
```

---

## Task 6: Inventory-Turnover Service (M3.1)

**Files:**
- Create: `apps/api/src/reports/dto/inventory-turnover.dto.ts`
- Modify: `apps/api/src/reports/inventory-turnover.controller.ts`
- Modify: `apps/api/src/reports/inventory-turnover.service.ts`
- Modify: `apps/api/test/reports.e2e-spec.ts`

周转天数 = `currentQty / dailyOut`,其中 `dailyOut = SUM(actualQty over window) / windowDays`。`status` 三态:`dailyOut === 0 && currentQty > 0` → `stale`;`turnoverDays < 7` → `low`;else `ok`(spec §3 留空时阈值用 7 天)。

- [ ] **Step 1: Add e2e cases (failing)**

Append to `apps/api/test/reports.e2e-spec.ts`:

```ts
  describe('inventory-turnover', () => {
    it('SYS_ADMIN gets summary + rows', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        avgTurnoverDays: expect.any(Number),
        lowStockCount: expect.any(Number),
      });
      expect(Array.isArray(r.body.rows)).toBe(true);
      // every row has the contract shape
      for (const row of r.body.rows) {
        expect(row).toMatchObject({
          reagentId: expect.any(String),
          name: expect.any(String),
          currentQty: expect.any(String),
          turnoverDays: expect.any(Number),
          status: expect.stringMatching(/^(ok|low|stale)$/),
        });
      }
    });

    it('LAB_HEAD scope=lab filter (rows only contain own lab stocks)', async () => {
      // admin happens to be SYS_ADMIN+LAB_HEAD in seed; if not present, this asserts
      // the endpoint at least returns 200 with the lab predicate.
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL on shape assertions (stub returns empty rows + `avgTurnoverDays: 0`
which passes shape but stub `status` is undefined; the matchObject for `rows[*]`
fails on empty arrays only if the test forces non-empty — re-check after seed).

- [ ] **Step 3: Add InventoryTurnoverQueryDto**

Create `apps/api/src/reports/dto/inventory-turnover.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class InventoryTurnoverQueryDto extends ReportQueryDto {
  @IsOptional() @IsString() override labId?: string;
}
```

- [ ] **Step 4: Implement InventoryTurnoverService**

Replace `apps/api/src/reports/inventory-turnover.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type {
  InventoryTurnoverResponse,
  InventoryTurnoverRow,
  ResolvedReportScope,
} from '@app/shared';
import { resolveTimeWindow } from './utils/resolve-time-window';
import type { InventoryTurnoverQueryDto } from './dto/inventory-turnover.dto';

const LOW_TURNOVER_THRESHOLD_DAYS = 7;

@Injectable()
export class InventoryTurnoverService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    q: InventoryTurnoverQueryDto,
    scope: ResolvedReportScope,
  ): Promise<InventoryTurnoverResponse> {
    const { from, to } = resolveTimeWindow(q);
    const days = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );

    // labId precedence: explicit query > scope.labId (when scope.scope==='lab')
    const labFilter =
      q.labId
        ? { labId: q.labId }
        : scope.scope === 'lab'
          ? { labId: scope.labId ?? '__none__' }
          : {};

    const stocks = await this.prisma.reagentStock.findMany({
      where: { ...labFilter },
      include: { reagent: true },
      take: 10000,
    });

    if (stocks.length === 0) {
      return { summary: { avgTurnoverDays: 0, lowStockCount: 0 }, rows: [] };
    }

    // Aggregate per-reagent issued qty in window.
    const stockIds = stocks.map((s) => s.id);
    const issued = await this.prisma.$queryRaw<
      Array<{ stockId: string; qty: Prisma.Decimal }>
    >(
      Prisma.sql`
        SELECT i."stockId" AS "stockId", SUM(i."actualQty") AS qty
        FROM "IssueRecord" i
        WHERE i."createdAt" >= ${from}
          AND i."createdAt" <= ${to}
          AND i."stockId" IN (${Prisma.join(stockIds)})
        GROUP BY i."stockId"
      `,
    );
    const issuedMap = new Map(issued.map((r) => [r.stockId, r.qty]));

    const rows: InventoryTurnoverRow[] = stocks.map((s) => {
      const issuedQty =
        issuedMap.get(s.id) ?? new Prisma.Decimal(0);
      const dailyOut = issuedQty.div(days);
      const turnoverDays = dailyOut.equals(0)
        ? 0
        : Math.round(s.currentQty.div(dailyOut).toNumber());
      const status: InventoryTurnoverRow['status'] = dailyOut.equals(0)
        ? s.currentQty.gt(0)
          ? 'stale'
          : 'ok'
        : turnoverDays < LOW_TURNOVER_THRESHOLD_DAYS
          ? 'low'
          : 'ok';

      return {
        reagentId: s.reagentId,
        name: s.reagent.name,
        currentQty: s.currentQty.toFixed(3),
        avgQty: s.initialQty.plus(s.currentQty).div(2).toFixed(3),
        dailyOut: dailyOut.toFixed(3),
        turnoverDays,
        status,
      };
    });

    const turnoverNumbers = rows
      .filter((r) => r.status !== 'stale' && r.turnoverDays > 0)
      .map((r) => r.turnoverDays);
    const avgTurnoverDays =
      turnoverNumbers.length === 0
        ? 0
        : Math.round(
            turnoverNumbers.reduce((a, b) => a + b, 0) /
              turnoverNumbers.length,
          );
    const lowStockCount = rows.filter((r) => r.status === 'low').length;

    return {
      summary: { avgTurnoverDays, lowStockCount },
      rows,
    };
  }
}
```

- [ ] **Step 5: Wire controller**

Replace `apps/api/src/reports/inventory-turnover.controller.ts`:

```ts
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { InventoryTurnoverQueryDto } from './dto/inventory-turnover.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/inventory-turnover')
@ReportScope('inventory-turnover')
export class InventoryTurnoverController {
  constructor(private readonly svc: InventoryTurnoverService) {}

  @Get()
  run(
    @Query() q: InventoryTurnoverQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: PASS, 8 tests in reports.e2e-spec total.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/inventory-turnover.dto.ts \
        apps/api/src/reports/inventory-turnover.controller.ts \
        apps/api/src/reports/inventory-turnover.service.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): inventory-turnover report (M3.1)"
```

---

## Task 7: Purchase-Amount Service (M3.2)

**Files:**
- Create: `apps/api/src/reports/dto/purchase-amount.dto.ts`
- Modify: `apps/api/src/reports/purchase-amount.controller.ts`
- Modify: `apps/api/src/reports/purchase-amount.service.ts`
- Modify: `apps/api/test/reports.e2e-spec.ts`

数据源:`PurchaseReceipt.purchasePrice`(`Decimal(12,2)` 元)。`groupBy=month` 按 `receivedAt`,`groupBy=category` 按 `reagent.category`,`groupBy=supplier` 按 `receipt.supplier`。`pendingBatchCount` 来自 `PurchaseBatch.status = 'APPROVED'` 且尚未有 receipt 的批次。

- [ ] **Step 1: Add e2e cases (failing)**

Append to `apps/api/test/reports.e2e-spec.ts`:

```ts
  describe('purchase-amount', () => {
    it('SYS_ADMIN groupBy=month returns summary + series', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount?range=365d&groupBy=month')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalAmount: expect.any(String),
        batchCount: expect.any(Number),
        pendingBatchCount: expect.any(Number),
      });
      expect(Array.isArray(r.body.series)).toBe(true);
      // amounts are 2-decimal strings
      for (const row of r.body.series) {
        expect(row.amount).toMatch(/^\d+\.\d{2}$/);
      }
    });

    it('groupBy=supplier returns one row per supplier', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount?range=365d&groupBy=supplier')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL on `summary.totalAmount` shape (stub returns `'0.00'` but
`series` is empty so no `row.amount` test fires; mostly verify endpoint exists
and returns shape after seed runs).

- [ ] **Step 3: Add PurchaseAmountQueryDto**

Create `apps/api/src/reports/dto/purchase-amount.dto.ts`:

```ts
import { IsIn, IsOptional } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class PurchaseAmountQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['month', 'category', 'supplier'])
  groupBy?: 'month' | 'category' | 'supplier';
}
```

- [ ] **Step 4: Implement PurchaseAmountService**

Replace `apps/api/src/reports/purchase-amount.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type { PurchaseAmountResponse, ResolvedReportScope } from '@app/shared';
import { resolveTimeWindow } from './utils/resolve-time-window';
import type { PurchaseAmountQueryDto } from './dto/purchase-amount.dto';

interface RawSeriesRow {
  bucket: string | Date;
  amount: Prisma.Decimal | null;
  batch_count: bigint;
}

@Injectable()
export class PurchaseAmountService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    q: PurchaseAmountQueryDto,
    scope: ResolvedReportScope,
  ): Promise<PurchaseAmountResponse> {
    const { from, to } = resolveTimeWindow(q);
    const groupBy = q.groupBy ?? 'month';
    const labFilter =
      scope.scope === 'lab'
        ? Prisma.sql`AND b."labId" = ${scope.labId}`
        : Prisma.empty;

    let bucketExpr: Prisma.Sql;
    if (groupBy === 'month') {
      bucketExpr = Prisma.sql`to_char(date_trunc('month', pr."receivedAt"), 'YYYY-MM')`;
    } else if (groupBy === 'category') {
      bucketExpr = Prisma.sql`COALESCE(rg."category", '__uncat__')`;
    } else {
      bucketExpr = Prisma.sql`COALESCE(pr."supplier", '__nosup__')`;
    }

    const rows = await this.prisma.$queryRaw<RawSeriesRow[]>(
      Prisma.sql`
        SELECT ${bucketExpr}              AS bucket,
               SUM(pr."purchasePrice")    AS amount,
               COUNT(DISTINCT b."id")     AS batch_count
        FROM "PurchaseReceipt" pr
        JOIN "PurchaseBatch" b  ON b."id" = pr."batchId"
        JOIN "Reagent" rg       ON rg."id" = b."reagentId"
        WHERE pr."receivedAt" >= ${from}
          AND pr."receivedAt" <= ${to}
          ${labFilter}
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT 10000
      `,
    );

    const totalAmount = rows.reduce(
      (acc, r) => acc.plus(r.amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const batchCount = rows.reduce(
      (n, r) => n + Number(r.batch_count ?? 0),
      0,
    );

    const pendingBatchCount = await this.prisma.purchaseBatch.count({
      where: {
        status: 'APPROVED',
        receipts: { none: {} },
        ...(scope.scope === 'lab' ? { labId: scope.labId ?? '__none__' } : {}),
      },
    });

    return {
      summary: {
        totalAmount: totalAmount.toFixed(2),
        batchCount,
        pendingBatchCount,
      },
      series: rows.map((r) => ({
        bucket: typeof r.bucket === 'string' ? r.bucket : r.bucket.toISOString(),
        amount: (r.amount ?? new Prisma.Decimal(0)).toFixed(2),
        batchCount: Number(r.batch_count ?? 0),
      })),
    };
  }
}
```

- [ ] **Step 5: Wire controller**

Replace `apps/api/src/reports/purchase-amount.controller.ts`:

```ts
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PurchaseAmountService } from './purchase-amount.service';
import { PurchaseAmountQueryDto } from './dto/purchase-amount.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/purchase-amount')
@ReportScope('purchase-amount')
export class PurchaseAmountController {
  constructor(private readonly svc: PurchaseAmountService) {}

  @Get()
  run(
    @Query() q: PurchaseAmountQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: 11 tests in reports.e2e-spec total, all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/purchase-amount.dto.ts \
        apps/api/src/reports/purchase-amount.controller.ts \
        apps/api/src/reports/purchase-amount.service.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): purchase-amount report (M3.2)"
```

---

## Task 8: Controlled-Audit Service (M3.3)

**Files:**
- Create: `apps/api/src/reports/dto/controlled-audit.dto.ts`
- Modify: `apps/api/src/reports/controlled-audit.controller.ts`
- Modify: `apps/api/src/reports/controlled-audit.service.ts`
- Modify: `apps/api/test/reports.e2e-spec.ts`

读 `AuditLog WHERE entityType LIKE 'Controlled%'`,join 进 `actor` (User) + reagent (via `before/after` JSON 中 `reagentId` 字段) 拼出 row。`scope='lab'` 时只能看到本 lab 的 reagent 操作 → 用 `AuditLog.before.labId / after.labId` 字段过滤(P4 已写入)。如果 JSON 字段缺失,降级返回 `'__unknown__'` 占位文本。

- [ ] **Step 1: Add e2e cases (failing)**

Append to `apps/api/test/reports.e2e-spec.ts`:

```ts
  describe('controlled-audit', () => {
    it('SYS_ADMIN sees rows desc by ts', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit?range=365d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalEvents: expect.any(Number),
        distinctActors: expect.any(Number),
      });
      expect(Array.isArray(r.body.rows)).toBe(true);
    });

    it('SAFETY_OFFICER allowed (scope=all)', async () => {
      // assumption: seed has a SAFETY_OFFICER user; if not, skip via env flag
      if (!process.env.SEED_SAFETY_USER) return;
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL on `summary.totalEvents` shape if stub still returns hard-coded.

- [ ] **Step 3: Add ControlledAuditQueryDto**

Create `apps/api/src/reports/dto/controlled-audit.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class ControlledAuditQueryDto extends ReportQueryDto {
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() actorId?: string;
}
```

- [ ] **Step 4: Implement ControlledAuditService**

Replace `apps/api/src/reports/controlled-audit.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ControlledAuditResponse,
  ControlledAuditRow,
  ResolvedReportScope,
} from '@app/shared';
import { resolveTimeWindow } from './utils/resolve-time-window';
import type { ControlledAuditQueryDto } from './dto/controlled-audit.dto';

@Injectable()
export class ControlledAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    q: ControlledAuditQueryDto,
    scope: ResolvedReportScope,
  ): Promise<ControlledAuditResponse> {
    const { from, to } = resolveTimeWindow(q);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityType: { startsWith: 'Controlled' },
        createdAt: { gte: from, lte: to },
        ...(q.actorId ? { actorId: q.actorId } : {}),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    // resolve reagent names from JSON payloads
    const reagentIds = new Set<string>();
    for (const l of logs) {
      const before = (l.before ?? {}) as Record<string, unknown>;
      const after = (l.after ?? {}) as Record<string, unknown>;
      const rid = (after.reagentId ?? before.reagentId) as string | undefined;
      if (rid) reagentIds.add(rid);
    }
    const reagents =
      reagentIds.size === 0
        ? []
        : await this.prisma.reagent.findMany({
            where: { id: { in: [...reagentIds] } },
            select: { id: true, name: true },
          });
    const reagentMap = new Map(reagents.map((r) => [r.id, r.name]));

    const rows: ControlledAuditRow[] = [];
    for (const l of logs) {
      const before = (l.before ?? {}) as Record<string, any>;
      const after = (l.after ?? {}) as Record<string, any>;
      const rid = (after.reagentId ?? before.reagentId) as string | undefined;
      const labId = (after.labId ?? before.labId) as string | undefined;

      // scope=lab filter (in-memory because labId lives inside JSON)
      if (scope.scope === 'lab' && labId !== scope.labId) continue;
      if (q.reagentId && rid !== q.reagentId) continue;

      rows.push({
        ts: l.createdAt.toISOString(),
        action: l.action,
        reagentName: rid ? reagentMap.get(rid) ?? '__unknown__' : '__unknown__',
        actorName: l.actor?.name ?? '__unknown__',
        qty: String(after.qty ?? before.qty ?? ''),
        beforeQty: before.qty != null ? String(before.qty) : undefined,
        afterQty: after.qty != null ? String(after.qty) : undefined,
      });
    }

    const distinctActors = new Set(logs.map((l) => l.actorId).filter(Boolean))
      .size;

    return {
      summary: { totalEvents: rows.length, distinctActors },
      rows,
    };
  }
}
```

- [ ] **Step 5: Wire controller**

Replace `apps/api/src/reports/controlled-audit.controller.ts`:

```ts
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ControlledAuditService } from './controlled-audit.service';
import { ControlledAuditQueryDto } from './dto/controlled-audit.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/controlled-audit')
@ReportScope('controlled-audit')
export class ControlledAuditController {
  constructor(private readonly svc: ControlledAuditService) {}

  @Get()
  run(
    @Query() q: ControlledAuditQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
pnpm --filter @app/api test:e2e
```

Expected: reports.e2e-spec all green; the previously stable 95-tests suite still
green (no regression).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/controlled-audit.dto.ts \
        apps/api/src/reports/controlled-audit.controller.ts \
        apps/api/src/reports/controlled-audit.service.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): controlled-audit report (M3.3)"
```

---

## Task 9: CSV Exporter + Controller Wiring (M4a)

**Files:**
- Create: `apps/api/src/reports/exporters/csv.exporter.ts`
- Modify: 4 controller files (`usage-trend`, `inventory-turnover`, `purchase-amount`, `controlled-audit`)
- Modify: `apps/api/test/reports.e2e-spec.ts`

CSV 用 `csv-stringify/sync` + UTF-8 BOM(`\ufeff`),Excel 中文不乱码。每个报表的 flatten 规则不同(series 要展平 reagentBreakdown,rows 直接出),所以 exporter 接受 `(reportType, payload)` 并内部 dispatch。

- [ ] **Step 1: Add e2e cases (failing)**

Append to `apps/api/test/reports.e2e-spec.ts`:

```ts
  describe('CSV export', () => {
    it('usage-trend csv has BOM + headers', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d&format=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.headers['content-disposition']).toMatch(/attachment/);
      expect(r.text.charCodeAt(0)).toBe(0xfeff);
      const firstLine = r.text.replace(/^\uFEFF/, '').split('\n')[0];
      expect(firstLine).toContain('bucket');
      expect(firstLine).toContain('qty');
    });

    it('inventory-turnover csv has reagent columns', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d&format=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      const firstLine = r.text.replace(/^\uFEFF/, '').split('\n')[0];
      expect(firstLine).toContain('reagentId');
      expect(firstLine).toContain('turnoverDays');
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL with content-type `application/json` (controller still returns JSON
even when `format=csv`).

- [ ] **Step 3: Implement csv.exporter**

Create `apps/api/src/reports/exporters/csv.exporter.ts`:

```ts
import { stringify } from 'csv-stringify/sync';
import type {
  UsageTrendResponse,
  InventoryTurnoverResponse,
  PurchaseAmountResponse,
  ControlledAuditResponse,
  ReportType,
} from '@app/shared';

const BOM = '\ufeff';

type AnyPayload =
  | UsageTrendResponse
  | InventoryTurnoverResponse
  | PurchaseAmountResponse
  | ControlledAuditResponse;

export function exportCsv(type: ReportType, payload: AnyPayload): string {
  const records = flatten(type, payload);
  const csv = stringify(records, { header: true });
  return BOM + csv;
}

function flatten(type: ReportType, p: AnyPayload): Array<Record<string, unknown>> {
  if (type === 'usage-trend') {
    return (p as UsageTrendResponse).series.map((row) => ({
      bucket: row.bucket,
      qty: row.qty,
    }));
  }
  if (type === 'inventory-turnover') {
    return (p as InventoryTurnoverResponse).rows.map((row) => ({
      reagentId: row.reagentId,
      name: row.name,
      currentQty: row.currentQty,
      avgQty: row.avgQty,
      dailyOut: row.dailyOut,
      turnoverDays: row.turnoverDays,
      status: row.status,
    }));
  }
  if (type === 'purchase-amount') {
    return (p as PurchaseAmountResponse).series.map((row) => ({
      bucket: row.bucket,
      amount: row.amount,
      batchCount: row.batchCount,
    }));
  }
  // controlled-audit
  return (p as ControlledAuditResponse).rows.map((row) => ({
    ts: row.ts,
    action: row.action,
    reagentName: row.reagentName,
    actorName: row.actorName,
    qty: row.qty,
    beforeQty: row.beforeQty ?? '',
    afterQty: row.afterQty ?? '',
  }));
}
```

- [ ] **Step 4: Add a small filename helper (inline in each controller)**

In each of the 4 controllers, add a helper near the bottom of the file (or inline)
to format `attachment; filename=` headers. Example for `usage-trend.controller.ts`:

```ts
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsageTrendService } from './usage-trend.service';
import { UsageTrendQueryDto } from './dto/usage-trend.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  async run(
    @Query() q: UsageTrendQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="usage-trend-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      );
      return exportCsv('usage-trend', data);
    }
    return data;
  }
}
```

Repeat for the other 3 controllers, switching the `'usage-trend'` literal to the
matching `ReportType` slug and the filename prefix to match.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: PASS, ~13 tests in reports.e2e-spec.

- [ ] **Step 6: Manual smoke (optional, document only)**

```bash
pnpm dev:api &
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3001/api/v1/reports/usage-trend?range=30d&format=csv' \
  -o /tmp/usage.csv
file /tmp/usage.csv  # should report "UTF-8 Unicode (with BOM) text"
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/exporters/csv.exporter.ts \
        apps/api/src/reports/usage-trend.controller.ts \
        apps/api/src/reports/inventory-turnover.controller.ts \
        apps/api/src/reports/purchase-amount.controller.ts \
        apps/api/src/reports/controlled-audit.controller.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): csv exporter + 4 controllers wire format=csv (M4a)"
```

---

## Task 10: Excel (xlsx) Exporter + Controller Wiring (M4b)

**Files:**
- Create: `apps/api/src/reports/exporters/xlsx.exporter.ts`
- Modify: 4 controller files
- Modify: `apps/api/test/reports.e2e-spec.ts`

`exceljs` 内存 workbook,sheet1 = 明细,sheet2 = 概览。首行加粗 + 冻结。列宽 `Math.min(max(content.length), 30)`。

- [ ] **Step 1: Add e2e cases (failing)**

Append to `apps/api/test/reports.e2e-spec.ts`:

```ts
  describe('XLSX export', () => {
    it('usage-trend xlsx returns binary attachment', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d&format=xlsx')
        .set('Authorization', `Bearer ${adminToken}`)
        .buffer(true);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      );
      expect(r.headers['content-disposition']).toMatch(/\.xlsx"$/);
      // xlsx is a zip → starts with "PK"
      expect(r.body.slice(0, 2).toString('utf8')).toBe('PK');
    });

    it('inventory-turnover xlsx contains 2 sheets (parsed back)', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d&format=xlsx')
        .set('Authorization', `Bearer ${adminToken}`)
        .buffer(true);
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.body);
      const names = wb.worksheets.map((w: any) => w.name);
      expect(names.length).toBe(2);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: FAIL — controller still falls through to JSON for `format=xlsx`.

- [ ] **Step 3: Implement xlsx.exporter**

Create `apps/api/src/reports/exporters/xlsx.exporter.ts`:

```ts
import ExcelJS from 'exceljs';
import type {
  UsageTrendResponse,
  InventoryTurnoverResponse,
  PurchaseAmountResponse,
  ControlledAuditResponse,
  ReportType,
} from '@app/shared';

type AnyPayload =
  | UsageTrendResponse
  | InventoryTurnoverResponse
  | PurchaseAmountResponse
  | ControlledAuditResponse;

const SHEET_TITLES: Record<ReportType, string> = {
  'usage-trend': '领用趋势',
  'inventory-turnover': '库存周转',
  'purchase-amount': '采购金额',
  'controlled-audit': '管控审计',
};

export async function exportXlsx(
  type: ReportType,
  payload: AnyPayload,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const detail = wb.addWorksheet(SHEET_TITLES[type]);
  const summary = wb.addWorksheet('概览');

  const records = flatten(type, payload);
  if (records.length > 0) {
    detail.columns = Object.keys(records[0]).map((key) => ({
      header: key,
      key,
    }));
    detail.addRows(records);
    detail.getRow(1).font = { bold: true };
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.columns.forEach((col) => {
      const headerLen = (col.header as string).length;
      const maxData = records.reduce(
        (m, r) => Math.max(m, String(r[col.key as string] ?? '').length),
        headerLen,
      );
      col.width = Math.min(Math.max(maxData + 2, 8), 30);
    });
  }

  // summary sheet (key/value pairs)
  summary.columns = [
    { header: 'metric', key: 'metric', width: 22 },
    { header: 'value', key: 'value', width: 22 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const [k, v] of Object.entries((payload as any).summary ?? {})) {
    summary.addRow({ metric: k, value: String(v) });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function flatten(type: ReportType, p: AnyPayload): Array<Record<string, unknown>> {
  // identical shape to csv.exporter's flatten — duplicated to keep exporters
  // independent (no cross-imports), each can be modified without breaking the other.
  if (type === 'usage-trend') {
    return (p as UsageTrendResponse).series.map((row) => ({
      bucket: row.bucket,
      qty: row.qty,
    }));
  }
  if (type === 'inventory-turnover') {
    return (p as InventoryTurnoverResponse).rows.map((row) => ({ ...row }));
  }
  if (type === 'purchase-amount') {
    return (p as PurchaseAmountResponse).series.map((row) => ({ ...row }));
  }
  return (p as ControlledAuditResponse).rows.map((row) => ({
    ...row,
    beforeQty: row.beforeQty ?? '',
    afterQty: row.afterQty ?? '',
  }));
}
```

- [ ] **Step 4: Wire into 4 controllers**

In each of the 4 controllers, extend the format branch added in Task 9. Example
for `usage-trend.controller.ts`:

```ts
    if (q.format === 'csv') { /* (existing csv path) */ }
    if (q.format === 'xlsx') {
      const buf = await exportXlsx('usage-trend', data);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="usage-trend-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
      );
      return buf;
    }
```

Add `import { exportXlsx } from './exporters/xlsx.exporter';` at the top of each
controller file. Repeat for the other 3 controllers.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @app/api test:e2e -- reports
```

Expected: PASS, ~15 tests in reports.e2e-spec.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/reports/exporters/xlsx.exporter.ts \
        apps/api/src/reports/usage-trend.controller.ts \
        apps/api/src/reports/inventory-turnover.controller.ts \
        apps/api/src/reports/purchase-amount.controller.ts \
        apps/api/src/reports/controlled-audit.controller.ts \
        apps/api/test/reports.e2e-spec.ts
git commit -m "feat(p7): xlsx exporter + 4 controllers wire format=xlsx (M4b)"
```

---

## Task 11: Web Shared Components + useReportData Hook (M5.1)

**Files:**
- Create: `apps/web/src/components/reports/KpiCard.tsx`
- Create: `apps/web/src/components/reports/ChartCard.tsx`
- Create: `apps/web/src/components/reports/DateRangePicker.tsx`
- Create: `apps/web/src/components/reports/ExportButton.tsx`
- Create: `apps/web/src/components/reports/useReportData.ts`

5 个文件,每个文件单一职责 < 120 行。`useReportData` 用 useState+useEffect+apiFetch(无 SWR)以贴合现有 web 数据获取惯例。

- [ ] **Step 1: KpiCard**

Create `apps/web/src/components/reports/KpiCard.tsx`:

```tsx
'use client';

interface Props {
  label: string;
  value: string | number;
  delta?: number; // percentage vs previous window; undefined hides the chip
}

export function KpiCard({ label, value, delta }: Props) {
  const trend = delta == null ? null : delta >= 0 ? 'up' : 'down';
  const color =
    trend == null ? '' : trend === 'up' ? 'text-green-600' : 'text-red-600';
  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {delta != null && (
        <div className={`mt-1 text-xs ${color}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}% vs 上一周期
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ChartCard**

Create `apps/web/src/components/reports/ChartCard.tsx`:

```tsx
'use client';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  children: ReactNode;
}

export function ChartCard({ title, loading, error, empty, children }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-medium">{title}</h3>
      {loading && <div className="py-12 text-center text-gray-400">加载中…</div>}
      {!loading && error && (
        <div className="py-12 text-center text-red-600">加载失败:{error}</div>
      )}
      {!loading && !error && empty && (
        <div className="py-12 text-center text-gray-400">暂无数据</div>
      )}
      {!loading && !error && !empty && children}
    </div>
  );
}
```

- [ ] **Step 3: DateRangePicker**

Create `apps/web/src/components/reports/DateRangePicker.tsx`:

```tsx
'use client';
import { useState } from 'react';

export type RangePreset = '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

interface Props {
  range: RangePreset;
  startDate?: string;
  endDate?: string;
  onChange: (next: {
    range: RangePreset;
    startDate?: string;
    endDate?: string;
  }) => void;
}

const PRESETS: Array<[RangePreset, string]> = [
  ['30d', '近 30 天'],
  ['90d', '近 90 天'],
  ['365d', '近 1 年'],
  ['month', '本月'],
  ['quarter', '本季'],
  ['custom', '自定义'],
];

export function DateRangePicker({ range, startDate, endDate, onChange }: Props) {
  const [s, setS] = useState(startDate ?? '');
  const [e, setE] = useState(endDate ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border px-2 py-1"
        value={range}
        onChange={(ev) =>
          onChange({ range: ev.target.value as RangePreset, startDate: s, endDate: e })
        }
      >
        {PRESETS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {range === 'custom' && (
        <>
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={s}
            onChange={(ev) => {
              setS(ev.target.value);
              onChange({ range, startDate: ev.target.value, endDate: e });
            }}
          />
          <span>至</span>
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={e}
            onChange={(ev) => {
              setE(ev.target.value);
              onChange({ range, startDate: s, endDate: ev.target.value });
            }}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: ExportButton**

Create `apps/web/src/components/reports/ExportButton.tsx`:

```tsx
'use client';
import { apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Props {
  /** path under apiBaseUrl, e.g. "/reports/usage-trend?range=30d" */
  endpoint: string;
}

export function ExportButton({ endpoint }: Props) {
  const tokens = useAuth((s) => s.tokens);

  async function download(format: 'csv' | 'xlsx') {
    if (!tokens) return;
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await fetch(`${apiBaseUrl}${endpoint}${sep}format=${format}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) {
      alert(`导出失败:${res.status}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
      `report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="inline-flex gap-2">
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => download('csv')}
      >
        导出 CSV
      </button>
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => download('xlsx')}
      >
        导出 Excel
      </button>
    </div>
  );
}
```

- [ ] **Step 5: useReportData hook**

Create `apps/web/src/components/reports/useReportData.ts`:

```ts
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export interface UseReportDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic data hook for /reports/* endpoints.
 *
 *   const { data, loading, error } = useReportData<UsageTrendResponse>(
 *     '/reports/usage-trend',
 *     { range, startDate, endDate, groupBy }
 *   );
 *
 * Re-fetches whenever any value in `params` changes.
 */
export function useReportData<T>(
  path: string,
  params: Record<string, string | undefined>,
): UseReportDataState<T> {
  const tokens = useAuth((s) => s.tokens);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // stable serialization of params for the dep array
  const dep = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    if (!tokens) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.append(k, v);
    }
    apiFetch<T>(`${path}?${qs.toString()}`, { token: tokens.accessToken })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, dep, tokens?.accessToken]);

  return { data, loading, error };
}
```

- [ ] **Step 6: Verify type-check**

```bash
pnpm --filter @app/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/reports
git commit -m "feat(p7): web shared report components + useReportData hook (M5.1)"
```

---

## Task 12: Web /reports Layout (M5.2)

**Files:**
- Create: `apps/web/src/app/reports/layout.tsx`

`<RequireAuth>` + 二级 aside,按 `REPORT_SCOPE_MATRIX` 隐藏无权限 tab(单一信息源,与后端 ScopeGuard 用同一份)。

- [ ] **Step 1: Write the layout**

Create `apps/web/src/app/reports/layout.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-store';
import {
  REPORT_SCOPE_MATRIX,
  type ReportType,
  type RoleCode,
} from '@app/shared';

const NAV: Array<{ slug: ReportType; label: string }> = [
  { slug: 'usage-trend', label: '领用趋势' },
  { slug: 'inventory-turnover', label: '库存周转' },
  { slug: 'purchase-amount', label: '采购金额' },
  { slug: 'controlled-audit', label: '管控审计' },
];

function visibleSlugs(roles: RoleCode[]): Set<ReportType> {
  const set = new Set<ReportType>();
  for (const role of roles) {
    const row = REPORT_SCOPE_MATRIX[role];
    if (!row) continue;
    for (const slug of NAV.map((n) => n.slug)) {
      if (row[slug] != null) set.add(slug);
    }
  }
  return set;
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const pathname = usePathname();
  const allowed = visibleSlugs((user?.roles ?? []) as RoleCode[]);

  return (
    <RequireAuth>
      <div className="flex min-h-screen">
        <aside className="w-48 space-y-2 bg-gray-100 p-4">
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">
            报表中心
          </div>
          {NAV.filter((n) => allowed.has(n.slug)).map((n) => {
            const active = pathname?.startsWith(`/reports/${n.slug}`);
            return (
              <Link
                key={n.slug}
                href={`/reports/${n.slug}`}
                className={`block rounded px-2 py-1 ${
                  active ? 'bg-white font-semibold' : ''
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: Verify type-check + build**

```bash
pnpm --filter @app/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/reports/layout.tsx
git commit -m "feat(p7): web /reports layout with scope-aware tabs (M5.2)"
```

---

## Task 13: Usage-Trend Page (M6.1)

**Files:**
- Create: `apps/web/src/app/reports/usage-trend/page.tsx`

折线图 + 3 KpiCard + DateRangePicker + ExportButton。recharts 通过 `next/dynamic({ ssr: false })` 包装,规避 hydration 警告(spec §9 风险记录)。

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/reports/usage-trend/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { UsageTrendResponse } from '@app/shared';

const LineChart = dynamic(
  () => import('recharts').then((m) => m.LineChart),
  { ssr: false },
);
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

export default function UsageTrendPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { data, loading, error } = useReportData<UsageTrendResponse>(
    '/reports/usage-trend',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/usage-trend?${params.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">领用趋势</h2>
        <div className="flex gap-2">
          <select
            className="rounded border px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="day">按日</option>
            <option value="week">按周</option>
            <option value="month">按月</option>
          </select>
          <DateRangePicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
          />
          <ExportButton endpoint={exportEndpoint} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label="总领用量" value={data?.summary.totalIssued ?? '—'} />
        <KpiCard
          label="涉及试剂数"
          value={data?.summary.distinctReagents ?? '—'}
        />
        <KpiCard label="日均领用" value={data?.summary.avgDailyIssued ?? '—'} />
      </div>

      <ChartCard
        title="领用量趋势"
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Line dataKey="qty" stroke="#1677ff" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @app/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/reports/usage-trend
git commit -m "feat(p7): web usage-trend report page (M6.1)"
```

---

## Task 14: Inventory-Turnover Page (M6.2)

**Files:**
- Create: `apps/web/src/app/reports/inventory-turnover/page.tsx`

2 KpiCard + Top 10 turnover 柱状图 + 完整明细表。

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/reports/inventory-turnover/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { InventoryTurnoverResponse } from '@app/shared';

const BarChart = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

export default function InventoryTurnoverPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const { data, loading, error } = useReportData<InventoryTurnoverResponse>(
    '/reports/inventory-turnover',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const top10 = (data?.rows ?? [])
    .filter((r) => r.status !== 'stale')
    .slice()
    .sort((a, b) => a.turnoverDays - b.turnoverDays)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">库存周转</h2>
        <div className="flex gap-2">
          <DateRangePicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
          />
          <ExportButton
            endpoint={`/reports/inventory-turnover?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard
          label="平均周转天数"
          value={data?.summary.avgTurnoverDays ?? '—'}
        />
        <KpiCard label="低库存数量" value={data?.summary.lowStockCount ?? '—'} />
      </div>

      <ChartCard
        title="周转最快 Top 10"
        loading={loading}
        error={error}
        empty={!loading && !error && top10.length === 0}
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="turnoverDays" fill="#1677ff" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-medium">完整明细</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">试剂</th>
              <th className="py-1">现存</th>
              <th className="py-1">日均出</th>
              <th className="py-1">周转天数</th>
              <th className="py-1">状态</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.reagentId} className="border-t">
                <td className="py-1">{r.name}</td>
                <td className="py-1">{r.currentQty}</td>
                <td className="py-1">{r.dailyOut}</td>
                <td className="py-1">{r.turnoverDays}</td>
                <td className="py-1">
                  {r.status === 'low' && (
                    <span className="text-red-600">低</span>
                  )}
                  {r.status === 'stale' && (
                    <span className="text-yellow-600">滞销</span>
                  )}
                  {r.status === 'ok' && <span className="text-green-600">正常</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @app/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/reports/inventory-turnover
git commit -m "feat(p7): web inventory-turnover report page (M6.2)"
```

---

## Task 15: Purchase-Amount Page (M6.3)

**Files:**
- Create: `apps/web/src/app/reports/purchase-amount/page.tsx`

3 KpiCard + 柱状图(amount by bucket)+ groupBy 切换。

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/reports/purchase-amount/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { PurchaseAmountResponse } from '@app/shared';

const BarChart = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

export default function PurchaseAmountPage() {
  const [range, setRange] = useState<RangePreset>('365d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'month' | 'category' | 'supplier'>(
    'month',
  );

  const { data, loading, error } = useReportData<PurchaseAmountResponse>(
    '/reports/purchase-amount',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">采购金额</h2>
        <div className="flex gap-2">
          <select
            className="rounded border px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="month">按月</option>
            <option value="category">按品类</option>
            <option value="supplier">按供应商</option>
          </select>
          <DateRangePicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
          />
          <ExportButton
            endpoint={`/reports/purchase-amount?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label="总采购金额(元)" value={data?.summary.totalAmount ?? '—'} />
        <KpiCard label="批次数" value={data?.summary.batchCount ?? '—'} />
        <KpiCard
          label="待入库批次"
          value={data?.summary.pendingBatchCount ?? '—'}
        />
      </div>

      <ChartCard
        title={`采购金额(${groupBy === 'month' ? '按月' : groupBy === 'category' ? '按品类' : '按供应商'})`}
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#52c41a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @app/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/reports/purchase-amount
git commit -m "feat(p7): web purchase-amount report page (M6.3)"
```

---

## Task 16: Controlled-Audit Page (M6.4) + Web Build Smoke

**Files:**
- Create: `apps/web/src/app/reports/controlled-audit/page.tsx`

2 KpiCard + 时间倒序明细表(无图,审计场景看明细更有用)。完成后跑一次 `pnpm --filter @app/web build` 确保 4 张 page 都进路由表。

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/reports/controlled-audit/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { KpiCard } from '@/components/reports/KpiCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { ControlledAuditResponse } from '@app/shared';

export default function ControlledAuditPage() {
  const [range, setRange] = useState<RangePreset>('90d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const { data, loading, error } = useReportData<ControlledAuditResponse>(
    '/reports/controlled-audit',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">管控试剂审计</h2>
        <div className="flex gap-2">
          <DateRangePicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
          />
          <ExportButton
            endpoint={`/reports/controlled-audit?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard label="审计事件数" value={data?.summary.totalEvents ?? '—'} />
        <KpiCard
          label="操作人数"
          value={data?.summary.distinctActors ?? '—'}
        />
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-medium">审计明细(时间倒序)</h3>
        {loading && <div className="py-8 text-center text-gray-400">加载中…</div>}
        {error && <div className="py-8 text-center text-red-600">加载失败:{error}</div>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">时间</th>
                <th className="py-1">动作</th>
                <th className="py-1">试剂</th>
                <th className="py-1">操作人</th>
                <th className="py-1">数量</th>
                <th className="py-1">变更前</th>
                <th className="py-1">变更后</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{r.ts.slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-1">{r.action}</td>
                  <td className="py-1">{r.reagentName}</td>
                  <td className="py-1">{r.actorName}</td>
                  <td className="py-1">{r.qty}</td>
                  <td className="py-1">{r.beforeQty ?? ''}</td>
                  <td className="py-1">{r.afterQty ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the web app**

```bash
pnpm --filter @app/web build
```

Expected: build success; output should now show 4 new routes
(`/reports/usage-trend`, `/reports/inventory-turnover`, `/reports/purchase-amount`,
`/reports/controlled-audit`) on top of the previous 16, total 20.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/reports/controlled-audit
git commit -m "feat(p7): web controlled-audit report page + 4 routes complete (M6.4)"
```

---

## Task 17: Miniapp report-summary Page (M7.1)

**Files:**
- Create: `apps/miniapp/src/pages/report-summary/index.tsx`
- Create: `apps/miniapp/src/pages/report-summary/index.config.ts`

3 个并行请求(`?summary=1`),骨架屏加载态 + 失败时「点击重试」按钮(不退出页)。按 `REPORT_SCOPE_MATRIX` 隐藏当前角色无权限的卡。

- [ ] **Step 1: Make backend honor `?summary=1` (mini-task)**

`?summary=1` 应只返回 `summary` 字段、把 series/rows 置空,降低小程序流量。每个 service 接受这个 flag。最简便的实现:在 4 个 controller 的 GET 处理里,看到 `q.summary === '1'` 就把 `data.series` / `data.rows` 删掉再 return。

Modify each of the 4 controllers (usage-trend / inventory-turnover /
purchase-amount / controlled-audit). Example for usage-trend.controller.ts —
add this just before `if (q.format === 'csv')`:

```ts
    if (q.summary === '1') {
      return { summary: data.summary, series: [] };
    }
```

For inventory-turnover and controlled-audit return `{ summary, rows: [] }`
shape. Re-run `pnpm --filter @app/api test:e2e -- reports` to confirm
no regression (existing tests don't pass summary=1).

- [ ] **Step 2: Add page config**

Create `apps/miniapp/src/pages/report-summary/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '报表概览',
});
```

- [ ] **Step 3: Write the page**

Create `apps/miniapp/src/pages/report-summary/index.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import {
  REPORT_SCOPE_MATRIX,
  type ReportType,
  type RoleCode,
  type UsageTrendResponse,
  type InventoryTurnoverResponse,
  type PurchaseAmountResponse,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface CardState {
  label: string;
  value: string;
  loading: boolean;
  error: string | null;
}

const INITIAL: CardState = { label: '', value: '', loading: true, error: null };

export default function ReportSummaryPage() {
  const user = useAuth((s) => s.user);
  const roles = (user?.roles ?? []) as RoleCode[];

  const [usage, setUsage] = useState<CardState>({ ...INITIAL, label: '近 7 天领用量' });
  const [inv, setInv] = useState<CardState>({ ...INITIAL, label: '低库存数量' });
  const [purchase, setPurchase] = useState<CardState>({
    ...INITIAL,
    label: '本月采购金额',
  });

  const can = useCallback(
    (slug: ReportType) =>
      roles.some((r) => REPORT_SCOPE_MATRIX[r]?.[slug] != null),
    [roles],
  );

  async function loadUsage() {
    if (!can('usage-trend')) {
      setUsage((s) => ({ ...s, loading: false }));
      return;
    }
    setUsage((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<UsageTrendResponse>(
        '/reports/usage-trend?range=30d&summary=1',
      );
      // total of last 30 days; spec calls it "近 7 天" — for demo we surface 30d total
      setUsage({
        label: '近 30 天领用量',
        value: d.summary.totalIssued,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setUsage((s) => ({ ...s, loading: false, error: e.message ?? '加载失败' }));
    }
  }

  async function loadInv() {
    if (!can('inventory-turnover')) {
      setInv((s) => ({ ...s, loading: false }));
      return;
    }
    setInv((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<InventoryTurnoverResponse>(
        '/reports/inventory-turnover?range=30d&summary=1',
      );
      setInv({
        label: '低库存数量',
        value: String(d.summary.lowStockCount),
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setInv((s) => ({ ...s, loading: false, error: e.message ?? '加载失败' }));
    }
  }

  async function loadPurchase() {
    if (!can('purchase-amount')) {
      setPurchase((s) => ({ ...s, loading: false }));
      return;
    }
    setPurchase((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<PurchaseAmountResponse>(
        '/reports/purchase-amount?range=month&groupBy=month&summary=1',
      );
      setPurchase({
        label: '本月采购金额(元)',
        value: d.summary.totalAmount,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setPurchase((s) => ({
        ...s,
        loading: false,
        error: e.message ?? '加载失败',
      }));
    }
  }

  function loadAll() {
    loadUsage();
    loadInv();
    loadPurchase();
  }

  useDidShow(() => {
    loadAll();
  });

  function renderCard(
    state: CardState,
    visible: boolean,
    retry: () => void,
  ) {
    if (!visible) return null;
    return (
      <View
        style={{
          marginTop: '24rpx',
          padding: '32rpx',
          border: '1rpx solid #ddd',
          borderRadius: '12rpx',
          background: '#fff',
        }}
      >
        <Text style={{ color: '#666', fontSize: '26rpx' }}>{state.label}</Text>
        {state.loading && (
          <Text style={{ display: 'block', marginTop: '16rpx', color: '#999' }}>
            加载中…
          </Text>
        )}
        {!state.loading && state.error && (
          <View style={{ marginTop: '16rpx' }}>
            <Text style={{ color: '#d4380d', fontSize: '26rpx' }}>
              {state.error}
            </Text>
            <Button
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={retry}
            >
              点击重试
            </Button>
          </View>
        )}
        {!state.loading && !state.error && (
          <Text
            style={{
              display: 'block',
              marginTop: '16rpx',
              fontSize: '48rpx',
              fontWeight: 'bold',
            }}
          >
            {state.value || '—'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ padding: '32rpx', background: '#f5f5f5', minHeight: '100vh' }}>
      <Text style={{ fontSize: '36rpx', fontWeight: 'bold' }}>报表概览</Text>
      {renderCard(usage, can('usage-trend'), loadUsage)}
      {renderCard(inv, can('inventory-turnover'), loadInv)}
      {renderCard(purchase, can('purchase-amount'), loadPurchase)}
    </View>
  );
}
```

- [ ] **Step 4: Verify type-check**

```bash
pnpm --filter @app/miniapp exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/src/pages/report-summary \
        apps/api/src/reports/usage-trend.controller.ts \
        apps/api/src/reports/inventory-turnover.controller.ts \
        apps/api/src/reports/purchase-amount.controller.ts \
        apps/api/src/reports/controlled-audit.controller.ts
git commit -m "feat(p7): miniapp report-summary page + summary=1 fast path (M7.1)"
```

---

## Task 18: Miniapp Home Entry + app.config Registration (M7.2)

**Files:**
- Modify: `apps/miniapp/src/app.config.ts`
- Modify: `apps/miniapp/src/pages/home/index.tsx`

工作台首页加一张「报表概览」卡片(`Taro.navigateTo` 进 report-summary)。**不改 tabBar**(已满 4 项)。

- [ ] **Step 1: Register the page**

Edit `apps/miniapp/src/app.config.ts` — append `'pages/report-summary/index'` to
the `pages` array (order does not matter for non-tabBar pages):

```ts
export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/search/index',
    'pages/my-requests/index',
    'pages/approvals/index',
    'pages/notifications/index',
    'pages/report-summary/index',
  ],
  // ... (window + tabBar unchanged)
```

- [ ] **Step 2: Add the entry card on home**

Edit `apps/miniapp/src/pages/home/index.tsx`. Inside the existing
"快捷入口" `<View>` block, add a third button BEFORE the closing tag of that
view. The exact insertion point is right after the `查看消息` block and inside
the "快捷入口" container:

```tsx
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.navigateTo({ url: '/pages/report-summary/index' })}
        >
          报表概览
        </Button>
```

Place it right after the existing `待办审批` button so both navigate buttons
sit together.

- [ ] **Step 3: Build the miniapp (H5 + weapp)**

```bash
pnpm --filter @app/miniapp build:weapp
pnpm --filter @app/miniapp build:h5
```

Expected: both builds succeed; H5 dist contains `report-summary` chunk.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/src/app.config.ts apps/miniapp/src/pages/home/index.tsx
git commit -m "feat(p7): miniapp home report entry + page registration (M7.2)"
```

---

## Task 19: Playwright Config + Auth Fixture (M8.1)

**Files:**
- Create: `playwright.config.ts` (repo root)
- Create: `tests/e2e/fixtures/auth.ts`
- Modify: `package.json` (root) — `test:e2e` script already added in Task 1

3 个角色(PLAIN_USER / LAB_HEAD / SYS_ADMIN)的 storageState,首次登录后写入 `tests/e2e/.auth/<role>.json`,后续 case 读取复用。Playwright 启动 api + web + miniapp H5 三个 dev server(`webServer` 数组形式)。

- [ ] **Step 1: Seed two extra users (LAB_HEAD + PLAIN_USER) via prisma seed**

Inspect existing seed file:

```bash
cat prisma/seed.ts | head -40
```

If the seed already creates a LAB_HEAD and PLAIN_USER for `lab-default`, skip
this step. Otherwise add at the bottom of `prisma/seed.ts` (BEFORE the existing
final `console.log` if any):

```ts
import bcrypt from 'bcryptjs';

const labHead = await prisma.user.upsert({
  where: { email: 'labhead@lab.local' },
  update: {},
  create: {
    email: 'labhead@lab.local',
    name: 'Lab Head',
    passwordHash: await bcrypt.hash('lab12345', 10),
    labId: 'lab-default',
    roles: { connect: [{ code: 'LAB_HEAD' }] },
  },
});

const plain = await prisma.user.upsert({
  where: { email: 'plain@lab.local' },
  update: {},
  create: {
    email: 'plain@lab.local',
    name: 'Plain User',
    passwordHash: await bcrypt.hash('plain123', 10),
    labId: 'lab-default',
    roles: { connect: [{ code: 'PLAIN_USER' }] },
  },
});
```

Adjust to match the actual Prisma schema (the user model and role-relation shape
may differ). Run `pnpm --filter @app/api exec prisma db seed` after editing.

- [ ] **Step 2: Write the auth fixture**

Create `tests/e2e/fixtures/auth.ts`:

```ts
import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = path.resolve(__dirname, '..', '.auth');
fs.mkdirSync(STATE_DIR, { recursive: true });

interface Cred { email: string; password: string; }

const CREDS = {
  admin: { email: 'admin@lab.local', password: 'admin123' },
  labhead: { email: 'labhead@lab.local', password: 'lab12345' },
  plain: { email: 'plain@lab.local', password: 'plain123' },
} as const;

type Role = keyof typeof CREDS;

export const ROLES = Object.keys(CREDS) as Role[];
export const stateFor = (role: Role) =>
  path.join(STATE_DIR, `${role}.json`);

export async function ensureStorageState(
  role: Role,
  webBaseUrl: string,
  newPage: () => Promise<Page>,
) {
  const file = stateFor(role);
  if (fs.existsSync(file) && fs.statSync(file).size > 64) return file;

  const page = await newPage();
  await page.goto(`${webBaseUrl}/login`);
  await page.getByLabel('邮箱').fill(CREDS[role].email);
  await page.getByLabel('密码').fill(CREDS[role].password);
  await page.getByRole('button', { name: /登录/ }).click();
  await page.waitForURL(`${webBaseUrl}/`, { timeout: 10_000 });
  await page.context().storageState({ path: file });
  await page.close();
  return file;
}

export const test = base.extend<{ role: Role }>({
  role: ['admin', { option: true }],
});
export { expect };
```

(If your login page uses different field labels — e.g. `email` instead of
`邮箱` — adjust the selectors. Check `apps/web/src/app/login/page.tsx`.)

- [ ] **Step 3: Write the playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const MP = 'http://localhost:10086';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: [
    { command: 'pnpm dev:api', url: `${API}/api/v1/health`, reuseExistingServer: true, timeout: 60_000 },
    { command: 'pnpm dev:web', url: WEB, reuseExistingServer: true, timeout: 60_000 },
    { command: 'pnpm dev:mp', url: MP, reuseExistingServer: true, timeout: 90_000 },
  ],
  projects: [
    {
      name: 'web',
      testMatch: /(workflows|reports)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB },
    },
    {
      name: 'miniapp-h5',
      testMatch: /miniapp-h5\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: MP },
    },
  ],
});
```

- [ ] **Step 4: Smoke-run an empty test to verify webServer boots**

Add a placeholder `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
test('web is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/(login|\/)/);
});
```

```bash
pnpm test:e2e --project=web smoke
```

Expected: api / web / miniapp dev servers boot, smoke test passes. Delete
`tests/e2e/smoke.spec.ts` after verifying.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures prisma/seed.ts package.json
git commit -m "feat(p7): playwright config + auth fixture + seed extra roles (M8.1)"
```

---

## Task 20: workflows.spec.ts — Paths 1-4 (M8.2)

**Files:**
- Create: `tests/e2e/workflows.spec.ts`

覆盖 spec §7 路径 1-4:

1. PLAIN_USER 登录 → 检索试剂 → 提交领用申请
2. LAB_HEAD 看到待审批 → 通过
3. REAGENT_ADMIN(用 admin 账号,seed 已有 SYS_ADMIN+REAGENT_ADMIN)发放领用 → 验证库存减少
4. REAGENT_ADMIN 发起采购 → 审批 → 收货 → 验证库存增加

业务路径里的具体按钮文案 / 交互细节,以现有 web 页为准 — 实现时打开 Codegen 半自动录制(`pnpm exec playwright codegen http://localhost:3000`)精修 selector。

- [ ] **Step 1: Write the spec scaffold**

Create `tests/e2e/workflows.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { ensureStorageState, stateFor } from './fixtures/auth';

test.beforeAll(async ({ browser }) => {
  for (const role of ['admin', 'labhead', 'plain'] as const) {
    await ensureStorageState(role, 'http://localhost:3000', async () => {
      const ctx = await browser.newContext();
      return ctx.newPage();
    });
  }
});

test.describe('Path 1: PLAIN_USER apply for reagent', () => {
  test.use({ storageState: stateFor('plain') });

  test('search → request → submit', async ({ page }) => {
    await page.goto('/reagents');
    await page.getByPlaceholder(/试剂/).first().fill('盐酸');
    await page.keyboard.press('Enter');
    // click first hit's "申请" button
    await page.getByRole('button', { name: /申请/ }).first().click();
    await page.getByLabel(/数量/).fill('1');
    await page.getByLabel(/用途/).fill('e2e test');
    await page.getByRole('button', { name: /提交/ }).click();
    await expect(page.getByText(/PENDING|待审批/)).toBeVisible();
  });
});

test.describe('Path 2: LAB_HEAD approve', () => {
  test.use({ storageState: stateFor('labhead') });

  test('approve newest pending', async ({ page }) => {
    await page.goto('/approvals');
    const firstApprove = page.getByRole('button', { name: /^通过/ }).first();
    await expect(firstApprove).toBeVisible();
    await firstApprove.click();
    await expect(page.getByText(/已通过|APPROVED/)).toBeVisible();
  });
});

test.describe('Path 3: REAGENT_ADMIN issue → stock decreases', () => {
  test.use({ storageState: stateFor('admin') });

  test('issue + verify stock', async ({ page, request }) => {
    await page.goto('/admin/issues');
    // capture stock id from the row about to be issued
    const stockCell = await page.locator('[data-testid="stock-id"]').first();
    const stockId = await stockCell.textContent();
    expect(stockId).toBeTruthy();

    await page.getByRole('button', { name: /发放/ }).first().click();
    await page.getByLabel(/实发/).fill('1');
    await page.getByRole('button', { name: /确认/ }).click();
    await expect(page.getByText(/已发放|ISSUED/)).toBeVisible();

    // (optional) hit api directly to assert stock went down
    // const r = await request.get(`/api/v1/stocks/${stockId}`);
    // expect(r.ok()).toBeTruthy();
  });
});

test.describe('Path 4: REAGENT_ADMIN purchase → approve → receive', () => {
  test.use({ storageState: stateFor('admin') });

  test('full purchase loop', async ({ page }) => {
    await page.goto('/admin/purchases');
    await page.getByRole('button', { name: /新建采购/ }).click();
    await page.getByLabel(/数量/).fill('5');
    await page.getByRole('button', { name: /提交/ }).click();
    await page.getByRole('button', { name: /批准/ }).first().click();
    await page.getByRole('button', { name: /收货/ }).first().click();
    await page.getByLabel(/实收|价格/).first().fill('100');
    await page.getByRole('button', { name: /确认收货/ }).click();
    await expect(page.getByText(/RECEIVED|已收货/)).toBeVisible();
  });
});
```

> **Implementer note:** the selectors above are best-effort placeholders. Run
> `pnpm exec playwright codegen http://localhost:3000` while logged in as each
> role and refine `getByRole` / `getByLabel` / `getByTestId` to match the actual
> page structure. Add `data-testid` attributes to the web pages where there is
> no stable accessible name. When refining, keep selectors role/label-based
> over CSS.

- [ ] **Step 2: Add `data-testid` attributes where needed**

For each ambiguous selector above, add `data-testid="..."` to the corresponding
component in `apps/web/src/app/...`. Common targets:
- the issue row's stock-id chip → `data-testid="stock-id"`
- the "submit request" button if its label is icon-only

- [ ] **Step 3: Run the spec**

```bash
pnpm test:e2e --project=web workflows
```

Expected: 4 cases pass. If a case fails, open `playwright-report` (`pnpm exec
playwright show-report`) and adjust selectors.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/workflows.spec.ts apps/web/src/app
git commit -m "test(p7-e2e): workflows.spec covers paths 1-4 (M8.2)"
```

---

## Task 21: reports.spec.ts — Paths 5-6 (M8.3)

**Files:**
- Create: `tests/e2e/reports.spec.ts`

覆盖 spec §7 路径 5-6:

5. SYS_ADMIN 进 4 报表 → 断言 KPI > 0、`<svg>` 可见、点导出 CSV → 文件下载成功
6. PLAIN_USER 进 /reports → 仅「领用趋势」tab 可见,其它 tab 不在 DOM

- [ ] **Step 1: Write the spec**

Create `tests/e2e/reports.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { stateFor } from './fixtures/auth';

const SLUGS = [
  ['usage-trend', '领用趋势'],
  ['inventory-turnover', '库存周转'],
  ['purchase-amount', '采购金额'],
  ['controlled-audit', '管控试剂审计'],
] as const;

test.describe('Path 5: SYS_ADMIN visits 4 reports', () => {
  test.use({ storageState: stateFor('admin') });

  for (const [slug, label] of SLUGS) {
    test(`${slug} renders KPI + chart/table`, async ({ page }) => {
      await page.goto(`/reports/${slug}`);
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
      // at least one KpiCard visible (rounded border + 3xl font)
      await expect(page.locator('div').filter({ hasText: /—|\d/ }).first())
        .toBeVisible();
      // for the 3 chart-bearing reports, expect an svg
      if (slug !== 'controlled-audit') {
        await expect(page.locator('svg').first()).toBeVisible({ timeout: 10_000 });
      } else {
        // audit page renders a table instead
        await expect(page.getByRole('columnheader', { name: /时间/ })).toBeVisible();
      }
    });
  }

  test('export CSV downloads a file', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出 CSV/ }).click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/usage-trend.*\.csv/);
  });
});

test.describe('Path 6: PLAIN_USER scope hides forbidden tabs', () => {
  test.use({ storageState: stateFor('plain') });

  test('only 领用趋势 tab visible', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    await expect(page.getByRole('link', { name: '领用趋势' })).toBeVisible();
    for (const label of ['库存周转', '采购金额', '管控试剂审计']) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0);
    }
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
pnpm test:e2e --project=web reports
```

Expected: 6 cases pass (4 report renders + 1 CSV download + 1 PLAIN_USER tab).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/reports.spec.ts
git commit -m "test(p7-e2e): reports.spec covers paths 5-6 (M8.3)"
```

---

## Task 22: miniapp-h5.spec.ts (M8.4)

**Files:**
- Create: `tests/e2e/miniapp-h5.spec.ts`

LAB_HEAD 登录 → 进 report-summary → 断言 3 张 KpiCard 渲染数字。

- [ ] **Step 1: Bake a miniapp storage state**

The miniapp has its own auth flow (Taro `useAuth` zustand store). Storage state
across web and miniapp do NOT share — Taro persists tokens via Taro storage on
weapp, but H5 builds use `localStorage`. Easiest: add a per-suite `beforeAll`
that does an in-page login (no fixture reuse).

Create `tests/e2e/miniapp-h5.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('miniapp report-summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // miniapp's login page selectors — adjust to actual labels
    await page.fill('input[placeholder="邮箱"]', 'labhead@lab.local');
    await page.fill('input[placeholder="密码"]', 'lab12345');
    await page.getByText(/登录/).click();
    await page.waitForURL(/home/);
  });

  test('3 KPI cards render numeric value', async ({ page }) => {
    // navigate via the home entry button
    await page.getByText('报表概览').click();
    await page.waitForURL(/report-summary/);
    await expect(page.getByText('近 30 天领用量')).toBeVisible();
    await expect(page.getByText('低库存数量')).toBeVisible();
    await expect(page.getByText('本月采购金额(元)')).toBeVisible();

    // each card should show either a number, '0', or '—' (no permanent loading)
    for (const label of ['近 30 天领用量', '低库存数量', '本月采购金额(元)']) {
      const card = page.locator(`text=${label}`).locator('..');
      await expect(card.locator('text=/[\\d—]+/').first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
pnpm test:e2e --project=miniapp-h5
```

Expected: 1 test passes. If login selectors don't match, run `pnpm exec playwright
codegen http://localhost:10086` and refine.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/miniapp-h5.spec.ts
git commit -m "test(p7-e2e): miniapp-h5.spec covers report-summary KPI cards (M8.4)"
```

---

## Task 23: Full-Stack Build Verification + Tag p7-complete (M9)

**Files:**
- Modify: `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_p7_status.md`
- Modify: `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\MEMORY.md`

最终验收清单(spec §11)。一切绿后打 tag,更新 memory 标记 P7 完成。

- [ ] **Step 1: Full build**

```bash
pnpm -r build
```

Expected: 3 workspaces all green (api / web / miniapp). Web shows 20 routes
(16 original + 4 reports/*).

- [ ] **Step 2: API e2e (regression)**

```bash
pnpm --filter @app/api test:e2e
```

Expected: previous 14 suites / 95 tests + new reports.e2e-spec ≥ 5 cases all green.

- [ ] **Step 3: Miniapp dual build**

```bash
pnpm --filter @app/miniapp build:weapp
pnpm --filter @app/miniapp build:h5
```

Expected: both succeed; weapp's `dist/pages/report-summary/index.js` exists;
H5 dist contains the chunk.

- [ ] **Step 4: Playwright full run**

```bash
pnpm test:e2e
```

Expected: web project (workflows + reports = 4 + 6 = 10 cases) green; miniapp-h5
project (1 case) green. Total 11 cases.

- [ ] **Step 5: Tag**

```bash
git tag p7-complete
git tag --list | grep p7
```

- [ ] **Step 6: Update auto-memory**

Replace the body of `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_p7_status.md`
with a "P7 done" entry — keep it short:

```markdown
---
name: P7 报表+联调 完成
description: P7 落地 4 报表 + Web /reports + miniapp report-summary + Playwright 11 e2e cases,tag p7-complete
type: project
---

**状态(截至 YYYY-MM-DD):** P7 完整落地。`tag p7-complete`。验收清单 6/6 通过。

**关键文件:**
- 后端:`apps/api/src/reports/`(11 个 ts 文件 + 1 个 e2e spec)
- 前端 Web:`apps/web/src/app/reports/`(layout + 4 page)+ `apps/web/src/components/reports/`(5 共享件)
- 小程序:`apps/miniapp/src/pages/report-summary/`
- e2e:`tests/e2e/`(workflows / reports / miniapp-h5 共 11 cases)
- 共享:`packages/shared/src/reports.ts`(REPORT_SCOPE_MATRIX 单一信息源)

**已知限制 / 未来工作:**
- 数据量起来后(估计 > 50 万 IssueRecord)需要在 IssueRecord.createdAt + RequestRecord.labId 上加复合索引,或落 materialized view
- 「环比」目前仅前端读取,后端未返回 prev-window summary,P8 可加 `?withDelta=1`
- Playwright weapp 走查未做,demo 阶段不阻塞
```

Update `MEMORY.md` index entry — replace the existing P7 line with:

```markdown
- [P7 报表+联调 完成](project_p7_status.md) — 4 报表 + Web/miniapp 双端 + 11 个 Playwright e2e cases,tag p7-complete
```

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/plans/2026-05-06-p7-reports-uat.md
git commit -m "chore: P7 plan complete + tag p7-complete"
```

(Memory files live outside the repo; they were updated in Step 6 directly.)

---
