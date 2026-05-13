import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
        receipt: null,
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
