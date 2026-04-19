import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LedgerService } from './ledger.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('controlled-ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @Audit({ action: 'LEDGER_EXPORT', entityType: 'ControlledLedger' })
  async query(
    @Query() q: QueryLedgerDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.ledger.query(q, user);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="controlled-ledger.csv"`,
      );
      return this.ledger.toCsv(rows);
    }
    return rows;
  }

  @Get('snapshots')
  async listSnapshots(
    @Query('labId') labId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.ledger.listSnapshots(labId, user);
  }

  @Get('snapshots/:id')
  async getSnapshot(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const snap = await this.ledger.getSnapshot(id, user);
    if (!snap) {
      res.status(404);
      return null;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${snap.yearMonth}.csv"`,
    );
    return snap.csvContent;
  }
}
