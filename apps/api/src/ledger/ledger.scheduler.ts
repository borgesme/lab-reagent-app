import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LedgerService } from './ledger.service';

@Injectable()
export class LedgerScheduler {
  private readonly logger = new Logger(LedgerScheduler.name);

  constructor(private readonly ledger: LedgerService) {}

  @Cron('5 0 1 * *')
  async monthly() {
    const now = new Date();
    const prev = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const yearMonth = `${prev.getUTCFullYear()}-${String(
      prev.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const labs = await this.ledger.listAllLabIds();
    for (const { id } of labs) {
      await this.ledger.generateMonthly(yearMonth, id);
    }
    this.logger.log(
      `generated snapshots for ${yearMonth}, labs=${labs.length}`,
    );
  }
}
