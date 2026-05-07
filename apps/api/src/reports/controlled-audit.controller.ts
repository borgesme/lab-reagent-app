import { Controller, Get, Query } from '@nestjs/common';
import { ControlledAuditService } from './controlled-audit.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/controlled-audit')
@ReportScope('controlled-audit')
export class ControlledAuditController {
  constructor(private readonly svc: ControlledAuditService) {}

  @Get()
  run(
    @Query() q: ReportQueryDto,
    @CurrentUser() _user: any,
  ) {
    const scope: ResolvedReportScope = { scope: 'all', userId: '', labId: null };
    return this.svc.run(q as unknown as Record<string, unknown>, scope);
  }
}
