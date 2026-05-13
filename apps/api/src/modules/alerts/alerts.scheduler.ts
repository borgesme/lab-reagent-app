import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(private readonly alerts: AlertsService) {}

  @Cron('58 7 * * *')
  async daily() {
    const n = await this.alerts.runDaily();
    this.logger.log(`daily alerts scheduler done, notifs=${n}`);
  }
}
