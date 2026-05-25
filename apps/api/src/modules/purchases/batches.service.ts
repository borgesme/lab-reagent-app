import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdService } from '../../common/id/id.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../notifications/mailer.service';
import { MergeBatchDto } from './dto/merge-batch.dto';
import { ApproveBatchDto } from './dto/approve-batch.dto';
import { ReceiptBatchDto } from './dto/receipt-batch.dto';
import type { ActorContext } from './purchases.service';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mailer: MailerService,
    private readonly ids: IdService,
  ) {}

  async merge(dto: MergeBatchDto, actor: ActorContext) {
    const items = await this.prisma.purchaseRequest.findMany({
      where: { id: { in: dto.requestIds } },
    });
    if (items.length !== dto.requestIds.length)
      throw new NotFoundException('purchase request not found');
    const labs = new Set(items.map((i) => i.labId));
    const reagents = new Set(items.map((i) => i.reagentId));
    const units = new Set(items.map((i) => i.unit));
    if (labs.size > 1 || reagents.size > 1 || units.size > 1)
      throw new BadRequestException('merge requires same lab/reagent/unit');
    if (items.some((i) => i.status !== 'PENDING'))
      throw new ConflictException('request not pending');

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (!actorUser?.labId || actorUser.labId !== items[0].labId)
      throw new ForbiddenException('forbidden');

    const total = items.reduce((s, i) => s + Number(i.quantity), 0);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.purchaseBatch.create({
        data: {
          id: this.ids.nextId(),
          labId: items[0].labId,
          reagentId: items[0].reagentId,
          totalQty: total.toString(),
          unit: items[0].unit,
          createdBy: actor.sub,
        },
      });
      await tx.purchaseRequest.updateMany({
        where: { id: { in: dto.requestIds } },
        data: { status: 'MERGED', batchId: batch.id },
      });
      return batch;
    });
  }

  async approve(batchId: string, dto: ApproveBatchDto, actor: ActorContext) {
    const batch = await this.prisma.purchaseBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException('batch not found');
    if (batch.status !== 'PENDING')
      throw new ConflictException('batch not pending');

    if (!actor.roles.includes('SYS_ADMIN')) {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (u?.labId !== batch.labId)
        throw new ForbiddenException('forbidden');
    }

    const nextStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseApproval.create({
        data: {
          id: this.ids.nextId(),
          batchId,
          approverId: actor.sub,
          action: dto.action,
          comment: dto.comment,
        },
      });
      const b = await tx.purchaseBatch.update({
        where: { id: batchId },
        data: {
          status: nextStatus,
          rejectedReason: dto.action === 'REJECT' ? dto.comment : null,
        },
      });
      if (dto.action === 'REJECT') {
        await tx.purchaseRequest.updateMany({
          where: { batchId },
          data: { status: 'PENDING', batchId: null },
        });
      }
      return b;
    });

    if (dto.action === 'APPROVE') {
      const recipients = await this.prisma.user.findMany({
        where: {
          labId: batch.labId,
          roles: { some: { role: { code: 'REAGENT_ADMIN' } } },
        },
      });
      for (const r of recipients) {
        const n = await this.notifications.create({
          recipientId: r.id,
          labId: batch.labId,
          type: 'PURCHASE_APPROVED',
          title: '采购批次已审批',
          body: `批次 ${batchId} 已通过，可以下单入库`,
          payload: { batchId, reagentId: batch.reagentId },
        });
        await this.mailer.send({
          notificationId: n.id,
          to: r.email,
          subject: '采购批次已审批',
          body: n.body,
        });
      }
    } else {
      const applicantIds = Array.from(new Set(batch.items.map((i) => i.applicantId)));
      for (const aid of applicantIds) {
        const u = await this.prisma.user.findUnique({ where: { id: aid } });
        if (!u) continue;
        const n = await this.notifications.create({
          recipientId: aid,
          labId: batch.labId,
          type: 'PURCHASE_REJECTED',
          title: '采购批次被驳回',
          body: `原因：${dto.comment ?? '无'}`,
          payload: { batchId, reagentId: batch.reagentId },
        });
        await this.mailer.send({
          notificationId: n.id,
          to: u.email,
          subject: '采购批次被驳回',
          body: n.body,
        });
      }
    }
    return updated;
  }

  async receive(batchId: string, dto: ReceiptBatchDto, actor: ActorContext) {
    const batch = await this.prisma.purchaseBatch.findUnique({
      where: { id: batchId },
      include: { items: true, receipt: true },
    });
    if (!batch) throw new NotFoundException('batch not found');
    if (batch.receipt) throw new ConflictException('receipt already recorded');
    if (batch.status !== 'APPROVED')
      throw new ConflictException('batch not approved');

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (actorUser?.labId !== batch.labId && !actor.roles.includes('SYS_ADMIN'))
      throw new ForbiddenException('forbidden');

    const receipt = await this.prisma.$transaction(async (tx) => {
      const stockId = this.ids.nextId();
      const receiptId = this.ids.nextId();
      await tx.reagentStock.create({
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
      await tx.purchaseBatch.update({
        where: { id: batchId },
        data: { status: 'RECEIVED' },
      });
      return r;
    });

    const applicantIds = Array.from(new Set(batch.items.map((i) => i.applicantId)));
    for (const aid of applicantIds) {
      const u = await this.prisma.user.findUnique({ where: { id: aid } });
      if (!u) continue;
      const n = await this.notifications.create({
        recipientId: aid,
        labId: batch.labId,
        type: 'PURCHASE_RECEIVED',
        title: '采购试剂已入库',
        body: `批次 ${batchId} 已入库，可申请领用`,
        payload: { batchId, stockId: receipt.stockId, reagentId: batch.reagentId },
      });
      await this.mailer.send({
        notificationId: n.id,
        to: u.email,
        subject: '采购试剂已入库',
        body: n.body,
      });
    }

    return receipt;
  }
}
