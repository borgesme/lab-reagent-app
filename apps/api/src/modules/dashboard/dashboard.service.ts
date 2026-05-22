import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKpi(actor: { sub: string; roles: string[] }): Promise<Kpi> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { labId: true },
    });

    const pendingWhere = this.buildPendingApprovalsWhere(actor, user?.labId ?? null);

    const [myRequests, stockAlerts, controlledReagents] =
      await this.prisma.$transaction([
        this.prisma.request.count({
          where: {
            applicantId: actor.sub,
            status: { in: ['DRAFT', 'PENDING', 'APPROVED', 'ISSUED'] },
          },
        }),
        this.prisma.notification.count({
          where: {
            recipientId: actor.sub,
            readAt: null,
            type: {
              in: ['ALERT_LOW_STOCK', 'ALERT_EXPIRING', 'ALERT_RECONCILE'],
            },
          },
        }),
        this.prisma.reagent.count({
          where: {
            deletedAt: null,
            OR: [
              { hazardLevel: 'CONTROLLED' },
              { controlType: { not: null } },
            ],
          },
        }),
      ]);

    const pendingApprovals = pendingWhere
      ? await this.prisma.request.count({ where: pendingWhere })
      : 0;

    return { pendingApprovals, myRequests, stockAlerts, controlledReagents };
  }

  private buildPendingApprovalsWhere(
    actor: { roles: string[] },
    labId: string | null,
  ): Prisma.RequestWhereInput | null {
    if (actor.roles.includes('SYS_ADMIN')) {
      return { status: 'PENDING' };
    }
    if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      if (!labId) return null;
      return { status: 'PENDING', labId };
    }
    return null;
  }
}
