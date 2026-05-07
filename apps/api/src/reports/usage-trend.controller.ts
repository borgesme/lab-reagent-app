import { Controller, Get, Query } from '@nestjs/common';
import { UsageTrendService } from './usage-trend.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { ResolvedReportScope } from '@app/shared';

@Controller('reports/usage-trend')
@ReportScope('usage-trend')
export class UsageTrendController {
  constructor(private readonly svc: UsageTrendService) {}

  @Get()
  run(
    @Query() q: ReportQueryDto,
    @CurrentUser() _user: any,
  ) {
    const scope: ResolvedReportScope = { scope: 'all', userId: '', labId: null };
    return this.svc.run(q as unknown as Record<string, unknown>, scope);
  }
}
