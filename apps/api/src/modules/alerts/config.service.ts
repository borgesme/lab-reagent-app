import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { QueryConfigDto } from './dto/query-config.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  async create(dto: UpsertConfigDto, actor: ActorContext) {
    await this.ensureLabAccess(dto.labId, actor);
    try {
      return await this.prisma.labReagentConfig.create({
        data: {
          labId: dto.labId,
          reagentId: dto.reagentId,
          safetyStock: dto.safetyStock,
          expireWarningDays: dto.expireWarningDays ?? 30,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('config exists');
      throw e;
    }
  }

  async update(id: string, dto: Partial<UpsertConfigDto>, actor: ActorContext) {
    const cfg = await this.prisma.labReagentConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException('config not found');
    await this.ensureLabAccess(cfg.labId, actor);
    return this.prisma.labReagentConfig.update({
      where: { id },
      data: {
        safetyStock: dto.safetyStock ?? undefined,
        expireWarningDays: dto.expireWarningDays ?? undefined,
      },
    });
  }

  async list(q: QueryConfigDto, actor: ActorContext) {
    const where: Prisma.LabReagentConfigWhereInput = {};
    if (q.reagentId) where.reagentId = q.reagentId;
    if (actor.roles.includes('SYS_ADMIN')) {
      if (q.labId) where.labId = q.labId;
    } else {
      const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (!u?.labId) throw new ForbiddenException('user has no lab');
      where.labId = u.labId;
    }
    return this.prisma.labReagentConfig.findMany({
      where,
      include: { reagent: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, actor: ActorContext) {
    const cfg = await this.prisma.labReagentConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException('config not found');
    await this.ensureLabAccess(cfg.labId, actor);
    return this.prisma.labReagentConfig.delete({ where: { id } });
  }

  private async ensureLabAccess(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    const u = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (u?.labId !== labId) throw new ForbiddenException('forbidden');
  }
}
