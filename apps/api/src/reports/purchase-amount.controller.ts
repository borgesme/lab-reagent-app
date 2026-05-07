import { Controller, Get, Query } from '@nestjs/common';
import { PurchaseAmountService } from './purchase-amount.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/purchase-amount')
@ReportScope('purchase-amount')
export class PurchaseAmountController {
  constructor(private readonly svc: PurchaseAmountService) {}

  @Get()
  run(
    @Query() q: ReportQueryDto,
    @CurrentUser() _user: any,
  ) {
    const scope: ResolvedReportScope = { scope: 'all', userId: '', labId: null };
    return this.svc.run(q as unknown as Record<string, unknown>, scope);
  }
}
