import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedReportScope, InventoryTurnoverResponse } from '@app/shared';

@Injectable()
export class InventoryTurnoverService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    _query: Record<string, unknown>,
    _scope: ResolvedReportScope,
  ): Promise<InventoryTurnoverResponse> {
    return {
      summary: { avgTurnoverDays: 0, lowStockCount: 0 },
      rows: [],
    };
  }
}
