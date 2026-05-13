import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';

@Injectable()
export class LabsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.lab.findMany({ where: { deletedAt: null } });
  }

  create(dto: CreateLabDto) {
    return this.prisma.lab.create({ data: dto });
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
