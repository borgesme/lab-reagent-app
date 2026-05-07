import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedReportScope, ControlledAuditResponse } from '@app/shared';

@Injectable()
export class ControlledAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    _query: Record<string, unknown>,
    _scope: ResolvedReportScope,
  ): Promise<ControlledAuditResponse> {
    return {
      summary: { totalEvents: 0, distinctActors: 0 },
      rows: [],
    };
  }
}
