import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}
  list() {
    return this.prisma.role.findMany({ orderBy: { code: 'asc' } });
  }
}
