import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryStockDto } from './dto/query-stock.dto';

export interface ActorContext {
  sub: string;
  roles: string[];
}

@Injectable()
export class StocksService {
  constructor(private prisma: PrismaService) {}

  async list(query: QueryStockDto, actor: ActorContext) {
    const where: any = { deletedAt: null };
    if (query.reagentId) where.reagentId = query.reagentId;
    const labFilter = await this.resolveLabFilter(query.labId, actor);
    if (labFilter) where.labId = labFilter;
    return this.prisma.reagentStock.findMany({
      where,
      include: { reagent: true, lab: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateStockDto, actor: ActorContext) {
    await this.assertLabAccess(dto.labId, actor);
    return this.prisma.reagentStock.create({
      data: {
        reagentId: dto.reagentId,
        labId: dto.labId,
        batchNo: dto.batchNo,
        mfgDate: dto.mfgDate ? new Date(dto.mfgDate) : null,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
        initialQty: dto.initialQty,
        currentQty: dto.currentQty,
        unit: dto.unit,
        location: dto.location,
        supplier: dto.supplier,
        purchasePrice: dto.purchasePrice,
      },
    });
  }

  async update(id: string, dto: UpdateStockDto, actor: ActorContext) {
    const stock = await this.prisma.reagentStock.findUnique({ where: { id } });
    if (!stock || stock.deletedAt) throw new NotFoundException();
    await this.assertLabAccess(stock.labId, actor);
    const data: any = {};
    if (dto.batchNo !== undefined) data.batchNo = dto.batchNo;
    if (dto.mfgDate) data.mfgDate = new Date(dto.mfgDate);
    if (dto.expireDate) data.expireDate = new Date(dto.expireDate);
    if (dto.currentQty !== undefined) data.currentQty = dto.currentQty;
    if (dto.unit) data.unit = dto.unit;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.supplier !== undefined) data.supplier = dto.supplier;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice;
    return this.prisma.reagentStock.update({ where: { id }, data });
  }

  async softDelete(id: string, actor: ActorContext) {
    const stock = await this.prisma.reagentStock.findUnique({ where: { id } });
    if (!stock || stock.deletedAt) throw new NotFoundException();
    await this.assertLabAccess(stock.labId, actor);
    return this.prisma.reagentStock.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async resolveLabFilter(
    requested: string | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    if (actor.roles.includes('SYS_ADMIN')) return requested ?? null;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    const labId = user?.labId ?? null;
    if (!labId) throw new ForbiddenException('user has no lab');
    if (requested && requested !== labId) throw new ForbiddenException();
    return labId;
  }

  private async assertLabAccess(
    labId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (actor.roles.includes('SYS_ADMIN')) return;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
