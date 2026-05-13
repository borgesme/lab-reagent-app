import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerScheduler } from './ledger.scheduler';

@Module({
  providers: [LedgerService, LedgerScheduler],
  controllers: [LedgerController],
  exports: [LedgerService],
})
export class LedgerModule {}
