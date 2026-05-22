import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpi')
  @ApiOperation({ summary: '工作台四指标聚合' })
  kpi(@Req() req: any) {
    return this.dashboard.getKpi({
      sub: req.user.sub,
      roles: req.user.roles ?? [],
    });
  }
}
