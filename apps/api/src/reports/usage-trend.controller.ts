import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsageTrendService } from './usage-trend.service';
import { UsageTrendQueryDto } from './dto/usage-trend.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  async run(
    @Query() q: UsageTrendQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="usage-trend-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return exportCsv('usage-trend', data);
    }
    return data;
  }
}
