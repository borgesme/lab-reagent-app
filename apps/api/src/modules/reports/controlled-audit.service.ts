import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const reagentIds = new Set<string>();
    const actorIds = new Set<string>();
    for (const l of logs) {
      const before = (l.before ?? {}) as Record<string, unknown>;
      const after = (l.after ?? {}) as Record<string, unknown>;
      const rid = (after.reagentId ?? before.reagentId) as string | undefined;
      if (rid) reagentIds.add(rid);
      if (l.actorId) actorIds.add(l.actorId);
    }
    const reagents =
      reagentIds.size === 0
        ? []
        : await this.prisma.reagent.findMany({
            where: { id: { in: [...reagentIds] } },
            select: { id: true, name: true },
          });
    const actors =
      actorIds.size === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: [...actorIds] } },
            select: { id: true, name: true },
          });
    const reagentMap = new Map(reagents.map((r) => [r.id, r.name]));
    const actorMap = new Map(actors.map((a) => [a.id, a.name]));

    const rows: ControlledAuditRow[] = [];
    for (const l of logs) {
      const before = (l.before ?? {}) as Record<string, any>;
      const after = (l.after ?? {}) as Record<string, any>;
      const rid = (after.reagentId ?? before.reagentId) as string | undefined;
      const labId = (after.labId ?? before.labId) as string | undefined;

      if (scope.scope === 'lab' && labId !== scope.labId) continue;
      if (q.reagentId && rid !== q.reagentId) continue;

      rows.push({
        ts: l.createdAt.toISOString(),
        action: l.action,
        reagentName: rid ? reagentMap.get(rid) ?? '__unknown__' : '__unknown__',
        actorName: l.actorId ? actorMap.get(l.actorId) ?? '__unknown__' : '__unknown__',
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
