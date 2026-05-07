import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ControlledAuditService } from './controlled-audit.service';
import { ControlledAuditQueryDto } from './dto/controlled-audit.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/controlled-audit')
@ReportScope('controlled-audit')
export class ControlledAuditController {
  constructor(private readonly svc: ControlledAuditService) {}

  @Get()
  async run(
    @Query() q: ControlledAuditQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="controlled-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return exportCsv('controlled-audit', data);
    }
    return data;
  }
}
