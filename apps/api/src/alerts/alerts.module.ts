import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigService } from './config.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigService],
  controllers: [AlertsController],
  exports: [ConfigService],
})
export class AlertsModule {}
