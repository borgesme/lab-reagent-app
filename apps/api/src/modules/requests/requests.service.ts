import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}

  async list(query: QueryRequestDto, actor: ActorContext) {
    const where: Prisma.RequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reagentId) where.reagentId = query.reagentId;

    if (query.scope === 'approval') {
      where.status = RequestStatus.PENDING;
      if (actor.roles.includes('SYS_ADMIN')) {
        if (query.labId) where.labId = query.labId;
      } else if (
        actor.roles.includes('LAB_HEAD') ||
        actor.roles.includes('REAGENT_ADMIN')
      ) {
        const user = await this.prisma.user.findUnique({
          where: { id: actor.sub },
        });
        if (!user?.labId) throw new ForbiddenException('user has no lab');
        where.labId = user.labId;
      } else {
        throw new ForbiddenException('scope=approval requires reviewer role');
      }
    } else if (query.mine === '1') {
      where.applicantId = actor.sub;
      if (actor.roles.includes('SYS_ADMIN') && query.labId) {
        where.labId = query.labId;
      }
    } else if (actor.roles.includes('SYS_ADMIN')) {
      if (query.labId) where.labId = query.labId;
    } else if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.sub },
      });
      if (!user?.labId) throw new ForbiddenException('user has no lab');
      where.labId = user.labId;
    } else {
      where.applicantId = actor.sub;
    }

    return this.prisma.request.findMany({
      where,
      include: {
        reagent: true,
        stock: true,
        lab: true,
        applicant: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({
      where: { id },
      include: {
        reagent: true,
        stock: true,
        lab: true,
        applicant: { select: { id: true, name: true, email: true } },
        approvals: { include: { approver: { select: { id: true, name: true } } } },
        issue: true,
      },
    });
    if (!req) throw new NotFoundException();
    await this.assertReadAccess(req.applicantId, req.labId, actor);
    return req;
  }

  async create(dto: CreateRequestDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.labId) throw new ForbiddenException('user has no lab');

    const stock = await this.prisma.reagentStock.findUnique({
      where: { id: dto.stockId },
      include: { reagent: true },
    });
    if (!stock || stock.deletedAt) throw new BadRequestException('stock not found');
    if (stock.reagentId !== dto.reagentId) {
      throw new BadRequestException('stock does not belong to reagent');
    }
    if (stock.labId !== user.labId) {
      throw new BadRequestException('stock not in your lab');
    }
    if (new Prisma.Decimal(dto.quantity).gt(stock.currentQty)) {
      throw new BadRequestException('quantity exceeds current stock');
    }

    if (isControlled(stock.reagent)) {
      if (!dto.purpose || dto.purpose.length < 50) {
        throw new BadRequestException(
          'purpose must be >= 50 chars for controlled reagents',
        );
      }
      if (!dto.projectRef) {
        throw new BadRequestException(
          'projectRef is required for controlled reagents',
        );
      }
      if (!dto.useLocation) {
        throw new BadRequestException(
          'useLocation is required for controlled reagents',
        );
      }
    }

    return this.prisma.request.create({
      data: {
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
    });
  }

  async cancel(id: string, actor: ActorContext) {
    const req = await this.prisma.request.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.applicantId !== actor.sub && !actor.roles.includes('SYS_ADMIN')) {
      throw new ForbiddenException('only applicant can cancel');
    }
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('only PENDING can be cancelled');
    }
    return this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED },
    });
  }

  private async assertReadAccess(
    applicantId: string,
    labId: string,
    actor: ActorContext,
  ) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (applicantId === actor.sub) return;
    if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (user?.labId === labId) return;
    }
    throw new ForbiddenException();
  }
}
