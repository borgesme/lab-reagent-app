import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { RoleCode } from '@prisma/client';
import { toUserView, toUserViews } from './users.view';

const INCLUDE_FOR_VIEW = {
  roles: { include: { role: true } },
  lab: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: INCLUDE_FOR_VIEW,
      orderBy: { createdAt: 'desc' },
    });
    return toUserViews(rows);
  }

  async listPaged(q: PageQueryDto) {
    const pageNum = q.pageNum ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: INCLUDE_FOR_VIEW,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: toUserViews(rows), total, pageNum, pageSize };
  }

  async batchDelete(ids: string[]) {
    const existing = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((u) => u.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        missing,
      });
    }
    const now = new Date();
    await this.prisma.$transaction(
      ids.map((id) =>
        this.prisma.user.update({
          where: { id },
          data: { deletedAt: now, tokenVersion: { increment: 1 } },
        }),
      ),
    );
    return { deleted: ids.length };
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('email exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const roleRecords = await this.resolveRoles(dto.roles ?? ['PLAIN_USER']);
    const row = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        labId: dto.labId,
        roles: { create: roleRecords.map((r) => ({ roleId: r.id })) },
      },
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.labId) data.labId = dto.labId;
    if (dto.roles) {
      const roleRecords = await this.resolveRoles(dto.roles);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: roleRecords.map((r) => ({ roleId: r.id })) };
    }
    const row = await this.prisma.user.update({
      where: { id },
      data,
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async softDelete(id: string) {
    const row = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { tempPassword };
  }

  private generateTempPassword(): string {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const pickN = (src: string, n: number) =>
      Array.from({ length: n }, () =>
        src[Math.floor(Math.random() * src.length)],
      ).join('');
    return pickN(letters, 4) + pickN(digits, 4);
  }

  private async resolveRoles(codes: RoleCode[]) {
    return this.prisma.role.findMany({ where: { code: { in: codes } } });
  }
}
