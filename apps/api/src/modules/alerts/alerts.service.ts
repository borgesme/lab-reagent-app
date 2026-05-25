import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../notifications/mailer.service';
import { IdService } from '../../common/id/id.service';

const DEFAULT_EXPIRE_WARN_DAYS = 30;

interface AlertFinding {
  type: 'ALERT_LOW_STOCK' | 'ALERT_EXPIRING' | 'ALERT_RECONCILE';
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mailer: MailerService,
    private readonly ids: IdService,
  ) {}

  async runDaily() {
    const labs = await this.prisma.lab.findMany({ where: { deletedAt: null } });
    let total = 0;
    for (const lab of labs) {
      try {
        const found = await this.scanLab(lab.id);
        total += found;
      } catch (e) {
        this.logger.error(`alerts lab=${lab.id} error=${(e as Error).message}`);
      }
    }
    await this.prisma.auditLog.create({
      data: {
        id: this.ids.nextId(),
        action: 'ALERT_SCAN',
        entityType: 'Alert',
        after: { labs: labs.length, totalNotifications: total },
      },
    });
    this.logger.log(`alerts scan done labs=${labs.length} notifs=${total}`);
    return total;
  }

  private async scanLab(labId: string): Promise<number> {
    const [lowStock, expiring, reconcile] = await Promise.all([
      this.findLowStock(labId),
      this.findExpiring(labId),
      this.findReconcileAnomalies(labId),
    ]);
    const findings = [...lowStock, ...expiring, ...reconcile];
    if (findings.length === 0) return 0;

    const recipients = await this.prisma.user.findMany({
      where: {
        labId,
        roles: {
          some: { role: { code: { in: ['LAB_HEAD', 'REAGENT_ADMIN'] } } },
        },
      },
    });
    let count = 0;
    for (const f of findings) {
      for (const r of recipients) {
        const n = await this.notifications.createIfAbsent({
          recipientId: r.id,
          labId,
          type: f.type,
          title: f.title,
          body: f.body,
          payload: f.payload,
        });
        if (n) {
          count++;
          await this.mailer.send({
            notificationId: n.id,
            to: r.email,
            subject: f.title,
            body: f.body,
          });
        }
      }
    }
    return count;
  }

  private async findLowStock(labId: string) {
    const configs = await this.prisma.labReagentConfig.findMany({
      where: { labId },
      include: { reagent: true },
    });
    const out: AlertFinding[] = [];
    for (const c of configs) {
      const stocks = await this.prisma.reagentStock.findMany({
        where: { labId, reagentId: c.reagentId, deletedAt: null },
      });
      const sum = stocks.reduce((s, x) => s + Number(x.currentQty), 0);
      if (sum < Number(c.safetyStock)) {
        out.push({
          type: 'ALERT_LOW_STOCK',
          title: `库存告急：${c.reagent.name}`,
          body: `当前总量 ${sum} ${stocks[0]?.unit ?? ''}，低于安全阈值 ${c.safetyStock}`,
          payload: { reagentId: c.reagentId, labId, current: sum },
        });
      }
    }
    return out;
  }

  private async findExpiring(labId: string) {
    const configs = await this.prisma.labReagentConfig.findMany({ where: { labId } });
    const daysByReagent = new Map<string, number>();
    configs.forEach((c) => daysByReagent.set(c.reagentId, c.expireWarningDays));
    const stocks = await this.prisma.reagentStock.findMany({
      where: { labId, deletedAt: null, expireDate: { not: null } },
      include: { reagent: true },
    });
    const now = Date.now();
    const out: AlertFinding[] = [];
    for (const s of stocks) {
      const days = daysByReagent.get(s.reagentId) ?? DEFAULT_EXPIRE_WARN_DAYS;
      const diff = (s.expireDate!.getTime() - now) / 86_400_000;
      if (diff <= days && diff >= -1) {
        out.push({
          type: 'ALERT_EXPIRING',
          title: `效期预警：${s.reagent.name}`,
          body: `批次 ${s.batchNo ?? s.id} 将于 ${s.expireDate!.toISOString().slice(0, 10)} 到期`,
          payload: { reagentId: s.reagentId, stockId: s.id, labId, days },
        });
      }
    }
    return out;
  }

  private async findReconcileAnomalies(labId: string) {
    const out: AlertFinding[] = [];
    const controlled = await this.prisma.reagent.findMany({
      where: {
        OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
      },
    });
    for (const r of controlled) {
      const stocks = await this.prisma.reagentStock.findMany({
        where: { labId, reagentId: r.id, deletedAt: null },
      });
      if (stocks.length === 0) continue;
      const initial = stocks.reduce((s, x) => s + Number(x.initialQty), 0);
      const current = stocks.reduce((s, x) => s + Number(x.currentQty), 0);
      const stockIds = stocks.map((s) => s.id);
      const issues = await this.prisma.issueRecord.findMany({
        where: { stockId: { in: stockIds } },
      });
      const issued = issues.reduce((s, x) => s + Number(x.actualQty), 0);
      if (Math.abs(initial - issued - current) > 0.001) {
        out.push({
          type: 'ALERT_RECONCILE',
          title: `管控对账异常：${r.name}`,
          body: `量不平 initial=${initial} issued=${issued} current=${current}`,
          payload: { reagentId: r.id, labId, kind: 'QTY' },
        });
      }
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const badIssues = await this.prisma.issueRecord.findMany({
      where: {
        createdAt: { gte: monthStart },
        request: {
          labId,
          reagent: {
            OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
          },
        },
      },
      include: { request: { include: { reagent: true } } },
    });
    for (const i of badIssues) {
      const bad =
        i.witnessId == null ||
        i.witnessId === i.issuerId ||
        !i.signatureDataUrl;
      if (bad) {
        out.push({
          type: 'ALERT_RECONCILE',
          title: `管控见证缺失：${i.request.reagent.name}`,
          body: `发放记录 ${i.id} 见证/签名不合规`,
          payload: { reagentId: i.request.reagentId, issueId: i.id, labId, kind: 'WITNESS' },
        });
      }
    }
    return out;
  }

  async listActiveForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        readAt: null,
        type: {
          in: ['ALERT_LOW_STOCK', 'ALERT_EXPIRING', 'ALERT_RECONCILE'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        createdAt: true,
      },
    });
  }
}
