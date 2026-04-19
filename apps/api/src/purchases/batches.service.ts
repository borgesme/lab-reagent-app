import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MergeBatchDto } from './dto/merge-batch.dto';
import type { ActorContext } from './purchases.service';

@Injectable()
export class BatchesService {
  constructor(private prisma: PrismaService) {}

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
}
