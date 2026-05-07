import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedReportScope, UsageTrendResponse } from '@app/shared';

@Injectable()
export class UsageTrendService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    _query: Record<string, unknown>,
    _scope: ResolvedReportScope,
  ): Promise<UsageTrendResponse> {
    return {
      summary: { totalIssued: '0.000', distinctReagents: 0, avgDailyIssued: '0.000' },
      series: [],
    };
  }
}
