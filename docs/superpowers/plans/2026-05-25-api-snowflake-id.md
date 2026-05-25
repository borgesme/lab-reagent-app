# API Snowflake ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested Snowflake ID generator to `apps/api` and make every application create path for single-field string primary-key models explicitly write Snowflake decimal-string IDs.

**Architecture:** Keep the Snowflake algorithm as a small pure utility under `apps/api/src/common/id/snowflake.ts`. Add a global NestJS `IdModule` with `IdService` so application services receive ID generation through DI, while Prisma schema remains `String @id @default(cuid())` as a fallback during this phase. Update every `create()` and `upsert.create` path for single-field primary keys to pass `id: this.ids.nextId()`; leave `UserRole` and fixed seed/e2e fixture IDs unchanged.

**Tech Stack:** NestJS, TypeScript 5, Jest with `ts-jest`, Prisma 5, Node `bigint`, pnpm workspace scripts.

---

## File Structure

- Create: `apps/api/src/common/id/snowflake.ts`
  - Pure Snowflake algorithm.
  - Exports `SnowflakeIdGenerator`, `SnowflakeIdGeneratorOptions`, `resolveSnowflakeWorkerId`, and constants needed by tests.
  - Uses injected `now()` for deterministic tests.
  - Returns decimal `string` IDs.
- Create: `apps/api/src/common/id/snowflake.spec.ts`
  - Unit tests for algorithm behavior, worker ID parsing, overflow, and clock rollback.
- Create: `apps/api/src/common/id/id.service.ts`
  - Nest provider wrapper around a single `SnowflakeIdGenerator` instance.
  - Enforces `SNOWFLAKE_WORKER_ID` production requirement.
- Create: `apps/api/src/common/id/id.service.spec.ts`
  - Unit tests for environment behavior and `nextId()` output.
- Create: `apps/api/src/common/id/id.module.ts`
  - Global module exporting `IdService`.
- Modify: `apps/api/src/app.module.ts`
  - Import `IdModule` once.
- Modify create paths:
  - `apps/api/src/common/interceptors/audit.interceptor.ts`
  - `apps/api/src/modules/alerts/alerts.service.ts`
  - `apps/api/src/modules/alerts/config.service.ts`
  - `apps/api/src/modules/auth/auth.service.ts`
  - `apps/api/src/modules/labs/labs.service.ts`
  - `apps/api/src/modules/ledger/ledger.service.ts`
  - `apps/api/src/modules/notifications/notifications.service.ts`
  - `apps/api/src/modules/purchases/batches.service.ts`
  - `apps/api/src/modules/purchases/purchases.service.ts`
  - `apps/api/src/modules/reagents/reagents.service.ts`
  - `apps/api/src/modules/requests/approvals.service.ts`
  - `apps/api/src/modules/requests/issues.service.ts`
  - `apps/api/src/modules/requests/requests.service.ts`
  - `apps/api/src/modules/stocks/stocks.service.ts`
  - `apps/api/src/modules/users/users.service.ts`
- Do not modify: `apps/api/prisma/schema.prisma`
- Do not modify fixed fixture IDs in seed/e2e unless a failing test requires it.

---

### Task 1: Add failing Snowflake algorithm tests

**Files:**
- Create: `apps/api/src/common/id/snowflake.spec.ts`

- [ ] **Step 1: Create the failing algorithm spec**

Create `apps/api/src/common/id/snowflake.spec.ts` with this exact content:

```ts
import {
  SnowflakeIdGenerator,
  resolveSnowflakeWorkerId,
} from './snowflake';

describe('SnowflakeIdGenerator', () => {
  it('returns a decimal string id', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 1,
      now: () => 1_800_000_000_000,
    });

    expect(generator.nextId()).toMatch(/^\d+$/);
  });

  it('generates unique ids for consecutive calls in the same millisecond', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 2,
      now: () => 1_800_000_000_000,
    });

    const ids = Array.from({ length: 10 }, () => generator.nextId());

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('increments sequence within the same millisecond', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 3,
      now: () => 1_800_000_000_000,
    });

    const first = BigInt(generator.nextId());
    const second = BigInt(generator.nextId());

    expect(second - first).toBe(1n);
  });

  it('resets sequence when the timestamp advances', () => {
    const timestamps = [1_800_000_000_000, 1_800_000_000_000, 1_800_000_000_001];
    const generator = new SnowflakeIdGenerator({
      workerId: 4,
      now: () => timestamps.shift() ?? 1_800_000_000_001,
    });

    generator.nextId();
    const sameMillisecond = BigInt(generator.nextId());
    const nextMillisecond = BigInt(generator.nextId());

    expect(sameMillisecond & 0xfffn).toBe(1n);
    expect(nextMillisecond & 0xfffn).toBe(0n);
  });

  it('accepts worker id lower and upper bounds', () => {
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 0,
          now: () => 1_800_000_000_000,
        }),
    ).not.toThrow();
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1023,
          now: () => 1_800_000_000_000,
        }),
    ).not.toThrow();
  });

  it('rejects worker ids outside the 10-bit range', () => {
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: -1,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1024,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1.5,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
  });

  it('waits for the next millisecond when sequence overflows', () => {
    let calls = 0;
    const generator = new SnowflakeIdGenerator({
      workerId: 5,
      now: () => {
        calls += 1;
        return calls <= 4097 ? 1_800_000_000_000 : 1_800_000_000_001;
      },
    });

    for (let i = 0; i < 4096; i += 1) {
      generator.nextId();
    }
    const overflowId = BigInt(generator.nextId());

    expect(overflowId & 0xfffn).toBe(0n);
  });

  it('throws when the clock moves backward', () => {
    const timestamps = [1_800_000_000_001, 1_800_000_000_000];
    const generator = new SnowflakeIdGenerator({
      workerId: 6,
      now: () => timestamps.shift() ?? 1_800_000_000_000,
    });

    generator.nextId();

    expect(() => generator.nextId()).toThrow(/SNOWFLAKE_CLOCK_MOVED_BACKWARD/);
  });
});

describe('resolveSnowflakeWorkerId', () => {
  it('defaults to 0 outside production when the env var is missing', () => {
    expect(resolveSnowflakeWorkerId(undefined, 'development')).toBe(0);
    expect(resolveSnowflakeWorkerId('', 'test')).toBe(0);
  });

  it('requires an explicit worker id in production', () => {
    expect(() => resolveSnowflakeWorkerId(undefined, 'production')).toThrow(
      /SNOWFLAKE_WORKER_ID_REQUIRED/,
    );
    expect(() => resolveSnowflakeWorkerId('', 'production')).toThrow(
      /SNOWFLAKE_WORKER_ID_REQUIRED/,
    );
  });

  it('parses a valid configured worker id', () => {
    expect(resolveSnowflakeWorkerId('7', 'production')).toBe(7);
  });

  it('rejects invalid configured worker ids', () => {
    expect(() => resolveSnowflakeWorkerId('abc', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('1.5', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('-1', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('1024', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
  });

  it('encodes the worker id in generated ids', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 7,
      now: () => 1_800_000_000_000,
    });

    const id = BigInt(generator.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(7n);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because implementation does not exist**

Run:

```bash
pnpm --filter @app/api test -- snowflake.spec.ts
```

Expected: FAIL with a TypeScript/module error containing `Cannot find module './snowflake'` or equivalent.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add apps/api/src/common/id/snowflake.spec.ts
git commit -m "test(api): cover snowflake id algorithm"
```

Expected: a new commit containing only `apps/api/src/common/id/snowflake.spec.ts`.

---

### Task 2: Implement the Snowflake algorithm

**Files:**
- Create: `apps/api/src/common/id/snowflake.ts`
- Test: `apps/api/src/common/id/snowflake.spec.ts`

- [ ] **Step 1: Create the algorithm implementation**

Create `apps/api/src/common/id/snowflake.ts` with this exact content:

```ts
export interface SnowflakeIdGeneratorOptions {
  workerId: number;
  epoch?: number;
  now?: () => number;
}

export const SNOWFLAKE_DEFAULT_EPOCH = 1_735_689_600_000;

const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_WORKER_ID = Number((1n << WORKER_ID_BITS) - 1n);
const MAX_SEQUENCE = Number((1n << SEQUENCE_BITS) - 1n);
const WORKER_ID_SHIFT = SEQUENCE_BITS;
const TIMESTAMP_SHIFT = WORKER_ID_BITS + SEQUENCE_BITS;

export class SnowflakeIdGenerator {
  private readonly workerId: number;
  private readonly epoch: number;
  private readonly now: () => number;
  private lastTimestamp = -1;
  private sequence = 0;

  constructor(options: SnowflakeIdGeneratorOptions) {
    this.workerId = options.workerId;
    this.epoch = options.epoch ?? SNOWFLAKE_DEFAULT_EPOCH;
    this.now = options.now ?? Date.now;
    assertValidWorkerId(this.workerId);
  }

  nextId(): string {
    let timestamp = this.currentTimestamp();

    if (timestamp < this.lastTimestamp) {
      throw new Error(
        `SNOWFLAKE_CLOCK_MOVED_BACKWARD: current timestamp ${timestamp} is before last timestamp ${this.lastTimestamp}`,
      );
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & MAX_SEQUENCE;
      if (this.sequence === 0) {
        timestamp = this.waitUntilNextTimestamp(timestamp);
      }
    } else {
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    return (
      (BigInt(timestamp - this.epoch) << TIMESTAMP_SHIFT) |
      (BigInt(this.workerId) << WORKER_ID_SHIFT) |
      BigInt(this.sequence)
    ).toString();
  }

  private currentTimestamp(): number {
    return this.now();
  }

  private waitUntilNextTimestamp(timestamp: number): number {
    let nextTimestamp = this.currentTimestamp();
    while (nextTimestamp <= timestamp) {
      nextTimestamp = this.currentTimestamp();
    }
    return nextTimestamp;
  }
}

export function resolveSnowflakeWorkerId(raw: string | undefined, nodeEnv: string | undefined): number {
  if (raw === undefined || raw === '') {
    if (nodeEnv === 'production') {
      throw new Error('SNOWFLAKE_WORKER_ID_REQUIRED: configure SNOWFLAKE_WORKER_ID in production');
    }
    return 0;
  }

  const workerId = Number(raw);
  assertValidWorkerId(workerId);
  return workerId;
}

function assertValidWorkerId(workerId: number): void {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
    throw new Error(`SNOWFLAKE_WORKER_ID_INVALID: workerId must be an integer between 0 and ${MAX_WORKER_ID}`);
  }
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @app/api test -- snowflake.spec.ts
```

Expected: PASS for all tests in `snowflake.spec.ts`.

- [ ] **Step 3: Run API unit tests**

Run:

```bash
pnpm --filter @app/api test
```

Expected: PASS, including the existing `resolve-time-window` tests and the new Snowflake tests.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add apps/api/src/common/id/snowflake.ts
git commit -m "feat(api): add snowflake id generator"
```

Expected: a new commit containing only `apps/api/src/common/id/snowflake.ts`.

---

### Task 3: Add failing IdService tests

**Files:**
- Create: `apps/api/src/common/id/id.service.spec.ts`

- [ ] **Step 1: Create the IdService spec**

Create `apps/api/src/common/id/id.service.spec.ts` with this exact content:

```ts
import { ConfigService } from '@nestjs/config';
import { IdService } from './id.service';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('IdService', () => {
  it('returns a decimal string id', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: '1',
      }),
    );

    expect(service.nextId()).toMatch(/^\d+$/);
  });

  it('defaults worker id to 0 outside production', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: undefined,
      }),
    );

    const id = BigInt(service.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(0n);
  });

  it('reads worker id from SNOWFLAKE_WORKER_ID', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: '9',
      }),
    );

    const id = BigInt(service.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(9n);
  });

  it('requires SNOWFLAKE_WORKER_ID in production', () => {
    expect(
      () =>
        new IdService(
          config({
            NODE_ENV: 'production',
            SNOWFLAKE_WORKER_ID: undefined,
          }),
        ),
    ).toThrow(/SNOWFLAKE_WORKER_ID_REQUIRED/);
  });

  it('rejects invalid SNOWFLAKE_WORKER_ID values', () => {
    expect(
      () =>
        new IdService(
          config({
            NODE_ENV: 'test',
            SNOWFLAKE_WORKER_ID: '1024',
          }),
        ),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because IdService does not exist**

Run:

```bash
pnpm --filter @app/api test -- id.service.spec.ts
```

Expected: FAIL with a TypeScript/module error containing `Cannot find module './id.service'` or equivalent.

- [ ] **Step 3: Commit the failing service tests**

Run:

```bash
git add apps/api/src/common/id/id.service.spec.ts
git commit -m "test(api): cover id service configuration"
```

Expected: a new commit containing only `apps/api/src/common/id/id.service.spec.ts`.

---

### Task 4: Implement IdService and IdModule

**Files:**
- Create: `apps/api/src/common/id/id.service.ts`
- Create: `apps/api/src/common/id/id.module.ts`
- Test: `apps/api/src/common/id/id.service.spec.ts`

- [ ] **Step 1: Create IdService**

Create `apps/api/src/common/id/id.service.ts` with this exact content:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SnowflakeIdGenerator, resolveSnowflakeWorkerId } from './snowflake';

@Injectable()
export class IdService {
  private readonly generator: SnowflakeIdGenerator;

  constructor(private readonly config: ConfigService) {
    this.generator = new SnowflakeIdGenerator({
      workerId: resolveSnowflakeWorkerId(
        this.config.get<string>('SNOWFLAKE_WORKER_ID'),
        this.config.get<string>('NODE_ENV'),
      ),
    });
  }

  nextId(): string {
    return this.generator.nextId();
  }
}
```

- [ ] **Step 2: Create IdModule**

Create `apps/api/src/common/id/id.module.ts` with this exact content:

```ts
import { Global, Module } from '@nestjs/common';
import { IdService } from './id.service';

@Global()
@Module({
  providers: [IdService],
  exports: [IdService],
})
export class IdModule {}
```

- [ ] **Step 3: Run the focused IdService test**

Run:

```bash
pnpm --filter @app/api test -- id.service.spec.ts
```

Expected: PASS for all tests in `id.service.spec.ts`.

- [ ] **Step 4: Run all API unit tests**

Run:

```bash
pnpm --filter @app/api test
```

Expected: PASS.

- [ ] **Step 5: Commit IdService and IdModule**

Run:

```bash
git add apps/api/src/common/id/id.service.ts apps/api/src/common/id/id.module.ts
git commit -m "feat(api): add injectable id service"
```

Expected: a new commit containing only `id.service.ts` and `id.module.ts`.

---

### Task 5: Register IdModule in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add the IdModule import**

In `apps/api/src/app.module.ts`, add this import with the other local module imports:

```ts
import { IdModule } from './common/id/id.module';
```

- [ ] **Step 2: Add IdModule to AppModule imports**

In the `@Module({ imports: [...] })` array, add `IdModule` near `RedisModule` and `PrismaModule`:

```ts
    LogsModule,
    RedisModule,
    IdModule,
    ScheduleModule.forRoot(),
    PrismaModule,
```

- [ ] **Step 3: Run API build**

Run:

```bash
pnpm --filter @app/api build
```

Expected: PASS.

- [ ] **Step 4: Commit AppModule registration**

Run:

```bash
git add apps/api/src/app.module.ts
git commit -m "chore(api): register id module"
```

Expected: a new commit containing only `apps/api/src/app.module.ts`.

---

### Task 6: Inject IdService into audit creation paths

**Files:**
- Modify: `apps/api/src/common/interceptors/audit.interceptor.ts`
- Modify: `apps/api/src/modules/alerts/alerts.service.ts`
- Modify: `apps/api/src/modules/ledger/ledger.service.ts`

- [ ] **Step 1: Update AuditInterceptor imports and constructor**

In `apps/api/src/common/interceptors/audit.interceptor.ts`, add:

```ts
import { IdService } from '../id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly ids: IdService,
  ) {
    this.logger.setContext('AuditInterceptor');
  }
```

- [ ] **Step 2: Add Snowflake ID to AuditInterceptor auditLog.create**

In `apps/api/src/common/interceptors/audit.interceptor.ts`, update the `auditLog.create` data object to start with `id`:

```ts
    await this.prisma.auditLog.create({
      data: {
        id: this.ids.nextId(),
        actorId,
        ip,
        action: meta.action,
        entityType: meta.entityType,
        entityId,
        before,
        after: after ?? null,
      },
    });
```

- [ ] **Step 3: Update AlertsService audit creation**

In `apps/api/src/modules/alerts/alerts.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mailer: MailerService,
    private readonly ids: IdService,
  ) {}
```

Update the audit log create data to:

```ts
    await this.prisma.auditLog.create({
      data: {
        id: this.ids.nextId(),
        action: 'ALERT_SCAN',
        entityType: 'Alert',
        after: { labs: labs.length, totalNotifications: total },
      },
    });
```

- [ ] **Step 4: Update LedgerService audit creation**

In `apps/api/src/modules/ledger/ledger.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the audit log create data to:

```ts
    await this.prisma.auditLog.create({
      data: {
        id: this.ids.nextId(),
        actorId: null,
        action: 'LEDGER_SNAPSHOT_GENERATE',
        entityType: 'ControlledLedgerSnapshot',
        entityId: snap.id,
        after: { labId, yearMonth, rowCount: rows.length } satisfies Prisma.InputJsonValue,
      },
    });
```

- [ ] **Step 5: Run unit tests and build**

Run:

```bash
pnpm --filter @app/api test && pnpm --filter @app/api build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit audit path changes**

Run:

```bash
git add apps/api/src/common/interceptors/audit.interceptor.ts apps/api/src/modules/alerts/alerts.service.ts apps/api/src/modules/ledger/ledger.service.ts
git commit -m "feat(api): use snowflake ids for audit logs"
```

Expected: a new commit containing only the three modified files.

---

### Task 7: Inject IdService into basic entity create paths

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/src/modules/labs/labs.service.ts`
- Modify: `apps/api/src/modules/reagents/reagents.service.ts`
- Modify: `apps/api/src/modules/stocks/stocks.service.ts`

- [ ] **Step 1: Update AuthService**

In `apps/api/src/modules/auth/auth.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private redis: RedisService,
    private readonly ids: IdService,
  ) {}
```

Update the user create data to:

```ts
    const user = await this.prisma.user.create({
      data: {
        id: this.ids.nextId(),
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: { create: [{ roleId: plainRole.id }] },
      },
    });
```

- [ ] **Step 2: Update UsersService**

In `apps/api/src/modules/users/users.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the user create data to:

```ts
    const row = await this.prisma.user.create({
      data: {
        id: this.ids.nextId(),
        email: dto.email,
        name: dto.name,
        passwordHash,
        labId: dto.labId,
        roles: { create: roleRecords.map((r) => ({ roleId: r.id })) },
      },
      include: INCLUDE_FOR_VIEW,
    });
```

- [ ] **Step 3: Update LabsService**

In `apps/api/src/modules/labs/labs.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Replace `create(dto: CreateLabDto)` with:

```ts
  create(dto: CreateLabDto) {
    return this.prisma.lab.create({
      data: {
        id: this.ids.nextId(),
        ...dto,
      },
    });
  }
```

- [ ] **Step 4: Update ReagentsService**

In `apps/api/src/modules/reagents/reagents.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Replace `create(dto: CreateReagentDto)` with:

```ts
  create(dto: CreateReagentDto) {
    return this.prisma.reagent.create({
      data: {
        id: this.ids.nextId(),
        ...dto,
      },
    });
  }
```

- [ ] **Step 5: Update StocksService**

In `apps/api/src/modules/stocks/stocks.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the reagent stock create data to:

```ts
      data: {
        id: this.ids.nextId(),
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
```

- [ ] **Step 6: Run unit tests and build**

Run:

```bash
pnpm --filter @app/api test && pnpm --filter @app/api build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit basic entity changes**

Run:

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/users/users.service.ts apps/api/src/modules/labs/labs.service.ts apps/api/src/modules/reagents/reagents.service.ts apps/api/src/modules/stocks/stocks.service.ts
git commit -m "feat(api): use snowflake ids for basic entities"
```

Expected: a new commit containing only the five modified files.

---

### Task 8: Inject IdService into request flow create paths

**Files:**
- Modify: `apps/api/src/modules/requests/requests.service.ts`
- Modify: `apps/api/src/modules/requests/approvals.service.ts`
- Modify: `apps/api/src/modules/requests/issues.service.ts`

- [ ] **Step 1: Update RequestsService**

In `apps/api/src/modules/requests/requests.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the request create data to:

```ts
      data: {
        id: this.ids.nextId(),
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
```

- [ ] **Step 2: Update ApprovalsService**

In `apps/api/src/modules/requests/approvals.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the approval create data to:

```ts
        id: this.ids.nextId(),
        requestId,
        approverId: actor.sub,
        action: dto.action,
        level,
        comment: dto.comment,
```

- [ ] **Step 3: Update IssuesService**

In `apps/api/src/modules/requests/issues.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the issue record create data to:

```ts
        id: this.ids.nextId(),
        requestId,
        issuerId: actor.sub,
        receiverId,
        witnessId: dto.witnessId ?? null,
        actualQty: dto.actualQty,
        stockId: req.stockId,
        signatureDataUrl: dto.signatureDataUrl ?? null,
```

- [ ] **Step 4: Run unit tests and build**

Run:

```bash
pnpm --filter @app/api test && pnpm --filter @app/api build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit request flow changes**

Run:

```bash
git add apps/api/src/modules/requests/requests.service.ts apps/api/src/modules/requests/approvals.service.ts apps/api/src/modules/requests/issues.service.ts
git commit -m "feat(api): use snowflake ids for request flow"
```

Expected: a new commit containing only the three modified files.

---

### Task 9: Inject IdService into purchase create paths

**Files:**
- Modify: `apps/api/src/modules/purchases/purchases.service.ts`
- Modify: `apps/api/src/modules/purchases/batches.service.ts`

- [ ] **Step 1: Update PurchasesService**

In `apps/api/src/modules/purchases/purchases.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the purchase request create data to:

```ts
      data: {
        id: this.ids.nextId(),
        applicantId: actor.sub,
        labId: user.labId,
        reagentId: dto.reagentId,
        quantity: dto.quantity,
        unit: dto.unit,
        reason: dto.reason,
      },
```

- [ ] **Step 2: Update BatchesService constructor**

In `apps/api/src/modules/purchases/batches.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mailer: MailerService,
    private readonly ids: IdService,
  ) {}
```

- [ ] **Step 3: Add Snowflake ID to purchaseBatch.create**

Update the purchase batch create data to:

```ts
        data: {
          id: this.ids.nextId(),
          labId: items[0].labId,
          reagentId: items[0].reagentId,
          totalQty: total.toString(),
          unit: items[0].unit,
          createdBy: actor.sub,
        },
```

- [ ] **Step 4: Add Snowflake ID to purchaseApproval.create**

Update the purchase approval create data to:

```ts
        data: {
          id: this.ids.nextId(),
          batchId,
          approverId: actor.sub,
          action: dto.action,
          comment: dto.comment,
        },
```

- [ ] **Step 5: Add Snowflake IDs to receipt stock and receipt creation**

Before `const stock = await tx.reagentStock.create({`, add:

```ts
      const stockId = this.ids.nextId();
      const receiptId = this.ids.nextId();
```

Update the stock create and receipt create blocks to:

```ts
      const stock = await tx.reagentStock.create({
        data: {
          id: stockId,
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
          id: receiptId,
          batchId,
          stockId,
          receivedBy: actor.sub,
          supplier: dto.supplier,
          purchasePrice: dto.purchasePrice,
        },
      });
```

- [ ] **Step 6: Run unit tests and build**

Run:

```bash
pnpm --filter @app/api test && pnpm --filter @app/api build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit purchase changes**

Run:

```bash
git add apps/api/src/modules/purchases/purchases.service.ts apps/api/src/modules/purchases/batches.service.ts
git commit -m "feat(api): use snowflake ids for purchases"
```

Expected: a new commit containing only the two modified files.

---

### Task 10: Inject IdService into notification, alert config, and ledger snapshot create paths

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts`
- Modify: `apps/api/src/modules/alerts/config.service.ts`
- Modify: `apps/api/src/modules/ledger/ledger.service.ts`

- [ ] **Step 1: Update NotificationsService**

In `apps/api/src/modules/notifications/notifications.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the notification create data to:

```ts
      data: {
        id: this.ids.nextId(),
        recipientId: args.recipientId,
        labId: args.labId ?? null,
        type: args.type,
        title: args.title,
        body: args.body,
        payload: (args.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
```

- [ ] **Step 2: Update alert ConfigService**

In `apps/api/src/modules/alerts/config.service.ts`, add:

```ts
import { IdService } from '../../common/id/id.service';
```

Replace the constructor with:

```ts
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}
```

Update the lab reagent config create data to:

```ts
      data: {
        id: this.ids.nextId(),
        labId: dto.labId,
        reagentId: dto.reagentId,
        safetyStock: dto.safetyStock,
        expireWarningDays: dto.expireWarningDays ?? 30,
      },
```

- [ ] **Step 3: Update LedgerService controlledLedgerSnapshot upsert create branch**

In `apps/api/src/modules/ledger/ledger.service.ts`, update the `controlledLedgerSnapshot.upsert` create branch to:

```ts
      create: {
        id: this.ids.nextId(),
        labId,
        yearMonth,
        csvContent,
        rowCount: rows.length,
      },
```

- [ ] **Step 4: Run unit tests and build**

Run:

```bash
pnpm --filter @app/api test && pnpm --filter @app/api build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit remaining create path changes**

Run:

```bash
git add apps/api/src/modules/notifications/notifications.service.ts apps/api/src/modules/alerts/config.service.ts apps/api/src/modules/ledger/ledger.service.ts
git commit -m "feat(api): use snowflake ids for remaining create paths"
```

Expected: a new commit containing only the three modified files.

---

### Task 11: Add e2e assertions for Snowflake-shaped application IDs

**Files:**
- Modify: `apps/api/test/labs.e2e-spec.ts`
- Modify: `apps/api/test/reagents.e2e-spec.ts`
- Modify: `apps/api/test/notifications.e2e-spec.ts`

- [ ] **Step 1: Add a local matcher helper in each touched spec**

In each touched e2e spec, add this helper near the top-level `describe` setup if no equivalent helper exists:

```ts
const expectSnowflakeId = (id: unknown) => {
  expect(typeof id).toBe('string');
  expect(id).toMatch(/^\d+$/);
};
```

- [ ] **Step 2: Assert created Lab IDs are numeric strings**

In the successful lab creation test in `apps/api/test/labs.e2e-spec.ts`, after the response body is available, add:

```ts
expectSnowflakeId(res.body.data.id);
```

If that spec stores the response in a different variable name, use that existing response variable and still assert the created row ID at `.body.data.id`.

- [ ] **Step 3: Assert created Reagent IDs are numeric strings**

In the successful reagent creation test in `apps/api/test/reagents.e2e-spec.ts`, after the response body is available, add:

```ts
expectSnowflakeId(res.body.data.id);
```

If that spec stores the response in a different variable name, use that existing response variable and still assert the created row ID at `.body.data.id`.

- [ ] **Step 4: Assert application-created Notification IDs are numeric strings**

In `apps/api/test/notifications.e2e-spec.ts`, find the path that creates a notification through `NotificationsService.create()` or an API/flow that calls it, then assert the returned notification ID:

```ts
expectSnowflakeId(notification.id);
```

If the spec reads the notification through the API response wrapper, assert:

```ts
expectSnowflakeId(res.body.data.id);
```

Do not change fixed fixture IDs that are explicitly inserted for setup.

- [ ] **Step 5: Run the touched e2e specs**

Run:

```bash
pnpm --filter @app/api test:e2e -- labs.e2e-spec.ts reagents.e2e-spec.ts notifications.e2e-spec.ts
```

Expected: PASS for the touched e2e specs.

- [ ] **Step 6: Commit e2e assertions**

Run:

```bash
git add apps/api/test/labs.e2e-spec.ts apps/api/test/reagents.e2e-spec.ts apps/api/test/notifications.e2e-spec.ts
git commit -m "test(api): assert snowflake ids in create flows"
```

Expected: a new commit containing only the touched e2e specs.

---

### Task 12: Final verification and diff audit

**Files:**
- Verify: `apps/api/src/common/id/*.ts`
- Verify: all modified `apps/api/src/**/*.ts`
- Verify unchanged: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm --filter @app/api test -- snowflake.spec.ts id.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run all API unit tests**

Run:

```bash
pnpm --filter @app/api test
```

Expected: PASS.

- [ ] **Step 3: Run API build**

Run:

```bash
pnpm --filter @app/api build
```

Expected: PASS.

- [ ] **Step 4: Run API e2e tests**

Run:

```bash
pnpm --filter @app/api test:e2e
```

Expected: PASS. If existing unrelated e2e failures appear, capture the failing spec names and error messages before changing code.

- [ ] **Step 5: Confirm Prisma schema stayed unchanged**

Run:

```bash
git diff -- apps/api/prisma/schema.prisma
```

Expected: no output.

- [ ] **Step 6: Search for production create paths still missing explicit id**

Run:

```bash
python - <<'PY'
from pathlib import Path
for path in Path('apps/api/src').rglob('*.ts'):
    text = path.read_text(encoding='utf-8')
    if '.create({' in text or 'create: {' in text:
        print(path)
PY
```

Expected: review the printed files manually. Every single-field primary-key model creation should include `id: this.ids.nextId()` or a local ID generated from `this.ids.nextId()`. `UserRole` nested creates should not include `id`.

- [ ] **Step 7: Inspect working tree**

Run:

```bash
git status --short
```

Expected: clean working tree, or only intentionally uncommitted planning/spec files if the operator chose not to commit documentation.

---

## Self-Review Notes

- Spec coverage: the plan covers the pure Snowflake algorithm, `IdService`, production worker ID requirement, all identified application create paths, `upsert.create`, audit logs, notification/config paths, tests, build, e2e, and Prisma schema non-change.
- Scope check: the plan does not migrate historical data, does not change DTOs, does not change Prisma field types, does not change `UserRole`, and does not replace JWT `jti` UUIDs.
- Type consistency: all business services use `private readonly ids: IdService` and call `this.ids.nextId(): string`; Snowflake output remains a decimal string compatible with Prisma `String` IDs.
