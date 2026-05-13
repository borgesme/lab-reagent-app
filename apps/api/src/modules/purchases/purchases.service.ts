import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');
    const reagent = await this.prisma.reagent.findUnique({ where: { id: dto.reagentId } });
    if (!reagent) throw new NotFoundException('reagent not found');
    if (Number(dto.quantity) <= 0)
      throw new BadRequestException('quantity must be positive');
    return this.prisma.purchaseRequest.create({
      data: {
        applicantId: actor.sub,
        labId: user.labId,
        reagentId: dto.reagentId,
        quantity: dto.quantity,
        unit: dto.unit,
        reason: dto.reason,
      },
    });
  }

  async listMine(actor: ActorContext) {
    return this.prisma.purchaseRequest.findMany({
      where: { applicantId: actor.sub },
      include: { reagent: true, batch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLab(actor: ActorContext, labId?: string) {
    const where: Prisma.PurchaseRequestWhereInput = {};
    if (actor.roles.includes('SYS_ADMIN')) {
      if (labId) where.labId = labId;
    } else {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (!u?.labId) throw new ForbiddenException('user has no lab');
      where.labId = u.labId;
    }
    return this.prisma.purchaseRequest.findMany({
      where,
      include: {
        reagent: true,
        applicant: { select: { id: true, name: true, email: true } },
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string, actor: ActorContext) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) throw new NotFoundException('purchase request not found');
    if (pr.applicantId !== actor.sub && !actor.roles.includes('SYS_ADMIN'))
      throw new ForbiddenException('forbidden');
    if (pr.status !== 'PENDING')
      throw new ConflictException('request not pending');
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
