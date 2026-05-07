import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { InventoryTurnoverQueryDto } from './dto/inventory-turnover.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/inventory-turnover')
@ReportScope('inventory-turnover')
export class InventoryTurnoverController {
  constructor(private readonly svc: InventoryTurnoverService) {}

  @Get()
  async run(
    @Query() q: InventoryTurnoverQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-turnover-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return exportCsv('inventory-turnover', data);
    }
    return data;
  }
}
