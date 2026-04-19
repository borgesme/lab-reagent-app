import { Controller, Get, Query, Res } from '@nestjs/common';
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
}
