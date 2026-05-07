import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedReportScope, PurchaseAmountResponse } from '@app/shared';

@Injectable()
export class PurchaseAmountService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    _query: Record<string, unknown>,
    _scope: ResolvedReportScope,
  ): Promise<PurchaseAmountResponse> {
    return {
      summary: { totalAmount: '0.00', batchCount: 0, pendingBatchCount: 0 },
      series: [],
    };
  }
}
