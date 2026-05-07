import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ControlledAuditService } from './controlled-audit.service';
import { ControlledAuditQueryDto } from './dto/controlled-audit.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/controlled-audit')
@ReportScope('controlled-audit')
export class ControlledAuditController {
  constructor(private readonly svc: ControlledAuditService) {}

  @Get()
  run(
    @Query() q: ControlledAuditQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
