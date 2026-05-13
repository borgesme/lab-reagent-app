import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MailerService } from './mailer.service';

@Module({
  providers: [NotificationsService, MailerService],
  controllers: [NotificationsController],
  exports: [NotificationsService, MailerService],
})
export class NotificationsModule {}
