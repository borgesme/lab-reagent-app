import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { InventoryTurnoverQueryDto } from './dto/inventory-turnover.dto';
import { ReportScope } from './decorators/report-scope.decorator';
import { exportCsv } from './exporters/csv.exporter';
import { exportXlsx } from './exporters/xlsx.exporter';
import type { ResolvedReportScope } from '@app/shared';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports/inventory-turnover')
@ReportScope('inventory-turnover')
export class InventoryTurnoverController {
  constructor(private readonly svc: InventoryTurnoverService) {}

  @Get()
  @ApiOperation({
    summary: '库存周转报表 (format=csv/xlsx 走下载, summary=1 仅返回汇总)',
  })
  async run(
    @Query() q: InventoryTurnoverQueryDto,
    @Req() req: Request & { reportScope: ResolvedReportScope },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.svc.run(q, req.reportScope);
    if (q.summary === '1') {
      return { summary: data.summary, rows: [] };
    }
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-turnover-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return exportCsv('inventory-turnover', data);
    }
    if (q.format === 'xlsx') {
      const buf = await exportXlsx('inventory-turnover', data);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-turnover-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      return new StreamableFile(buf);
    }
    return data;
  }
}
