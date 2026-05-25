import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdService } from '../../common/id/id.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { PageQueryDto } from './dto/page-query.dto';

@Injectable()
export class LabsService {
  constructor(
    private prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  list() {
    return this.prisma.lab.findMany({ where: { deletedAt: null } });
  }

  async listPaged(q: PageQueryDto) {
    const pageNum = q.pageNum ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where = { deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lab.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lab.count({ where }),
    ]);
    return { items, total, pageNum, pageSize };
  }

  async batchDelete(ids: string[]) {
    const existing = await this.prisma.lab.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((l) => l.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException({ code: 'LAB_NOT_FOUND', missing });
    }
    const now = new Date();
    await this.prisma.$transaction(
      ids.map((id) =>
        this.prisma.lab.update({
          where: { id },
          data: { deletedAt: now },
        }),
      ),
    );
    return { deleted: ids.length };
  }

  create(dto: CreateLabDto) {
    return this.prisma.lab.create({
      data: {
        id: this.ids.nextId(),
        ...dto,
      },
    });
  }

  async update(id: string, dto: UpdateLabDto) {
    const lab = await this.prisma.lab.findUnique({ where: { id } });
    if (!lab || lab.deletedAt) throw new NotFoundException();
    return this.prisma.lab.update({ where: { id }, data: dto });
  }

  softDelete(id: string) {
    return this.prisma.lab.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
