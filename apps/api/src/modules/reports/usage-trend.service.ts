import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
        JOIN "Request" r ON r."id" = i."requestId"
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
      throw new BadRequestException({ code: 'REPORT_TOO_LARGE' });
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
