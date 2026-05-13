import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PurchasesService } from './purchases.service';
import { BatchesService } from './batches.service';
import { PurchasesController } from './purchases.controller';

@Module({
  imports: [NotificationsModule],
  providers: [PurchasesService, BatchesService],
  controllers: [PurchasesController],
  exports: [PurchasesService, BatchesService],
})
export class PurchasesModule {}
