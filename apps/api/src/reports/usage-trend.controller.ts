import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UsageTrendService } from './usage-trend.service';
import { UsageTrendQueryDto } from './dto/usage-trend.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  run(
    @Query() q: UsageTrendQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
  ) {
    return this.svc.run(q, req.reportScope);
  }
}
