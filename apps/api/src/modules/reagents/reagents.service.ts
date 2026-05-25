import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdService } from '../../common/id/id.service';
import { CreateReagentDto } from './dto/create-reagent.dto';
import { UpdateReagentDto } from './dto/update-reagent.dto';
import { QueryReagentDto } from './dto/query-reagent.dto';

@Injectable()
export class ReagentsService {
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  list(query: QueryReagentDto) {
    const and: any[] = [{ deletedAt: null }];
    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { cas: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.category) and.push({ category: query.category });
    if (query.controlled === '1') {
      and.push({
        OR: [
          { hazardLevel: 'CONTROLLED' },
          { controlType: { not: null } },
        ],
      });
    }
    return this.prisma.reagent.findMany({
      where: { AND: and },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const r = await this.prisma.reagent.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException();
    return r;
  }

  create(dto: CreateReagentDto) {
    return this.prisma.reagent.create({
      data: {
        id: this.ids.nextId(),
        ...dto,
      },
    });
  }

  async update(id: string, dto: UpdateReagentDto) {
    const r = await this.prisma.reagent.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException();
    return this.prisma.reagent.update({ where: { id }, data: dto });
  }

  softDelete(id: string) {
    return this.prisma.reagent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
