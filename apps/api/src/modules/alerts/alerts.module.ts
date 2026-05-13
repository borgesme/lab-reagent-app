import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigService } from './config.service';
import { AlertsService } from './alerts.service';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigService, AlertsService, AlertsScheduler],
  controllers: [AlertsController],
  exports: [ConfigService, AlertsService],
})
export class AlertsModule {}
