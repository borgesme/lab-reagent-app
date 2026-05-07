import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { InventoryTurnoverQueryDto } from './dto/inventory-turnover.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/inventory-turnover')
@ReportScope('inventory-turnover')
export class InventoryTurnoverController {
  constructor(private readonly svc: InventoryTurnoverService) {}

  @Get()
  run(
    @Query() q: InventoryTurnoverQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
