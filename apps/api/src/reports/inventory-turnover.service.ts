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
      const issuedQty = issuedMap.get(s.id) ?? new Prisma.Decimal(0);
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
