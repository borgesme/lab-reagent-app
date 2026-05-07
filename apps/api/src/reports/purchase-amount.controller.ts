import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PurchaseAmountService } from './purchase-amount.service';
import { PurchaseAmountQueryDto } from './dto/purchase-amount.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/purchase-amount')
@ReportScope('purchase-amount')
export class PurchaseAmountController {
  constructor(private readonly svc: PurchaseAmountService) {}

  @Get()
  async run(
    @Query() q: PurchaseAmountQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="purchase-amount-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return exportCsv('purchase-amount', data);
    }
    return data;
  }
}
