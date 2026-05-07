import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PurchaseAmountService } from './purchase-amount.service';
import { PurchaseAmountQueryDto } from './dto/purchase-amount.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/purchase-amount')
@ReportScope('purchase-amount')
export class PurchaseAmountController {
  constructor(private readonly svc: PurchaseAmountService) {}

  @Get()
  run(
    @Query() q: PurchaseAmountQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
