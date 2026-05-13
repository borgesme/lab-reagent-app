import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReagentDto } from './dto/create-reagent.dto';
import { UpdateReagentDto } from './dto/update-reagent.dto';
import { QueryReagentDto } from './dto/query-reagent.dto';

@Injectable()
export class ReagentsService {
  constructor(private prisma: PrismaService) {}

  list(query: QueryReagentDto) {
    const where: any = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { cas: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    return this.prisma.reagent.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const r = await this.prisma.reagent.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException();
    return r;
  }

  create(dto: CreateReagentDto) {
    return this.prisma.reagent.create({ data: dto });
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
