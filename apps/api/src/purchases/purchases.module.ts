import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';

@Module({
  imports: [NotificationsModule],
  providers: [PurchasesService],
  controllers: [PurchasesController],
  exports: [PurchasesService],
})
export class PurchasesModule {}
