import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RoleCode } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { roles: { include: { role: true } }, lab: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('email exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const roleRecords = await this.resolveRoles(dto.roles ?? ['PLAIN_USER']);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        labId: dto.labId,
        roles: { create: roleRecords.map((r) => ({ roleId: r.id })) },
      },
    });
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
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
    });
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
