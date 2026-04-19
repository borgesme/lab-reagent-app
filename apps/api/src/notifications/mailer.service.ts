import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SendArgs {
  notificationId?: string;
  to: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(args: SendArgs): Promise<void> {
    try {
      this.logger.log(
        `[mail-stub] to=${args.to} subject="${args.subject}" notif=${args.notificationId ?? '-'}`,
      );
      if (args.notificationId) {
        await this.prisma.notification.update({
          where: { id: args.notificationId },
          data: { emailedAt: new Date() },
        });
      }
    } catch (e) {
      this.logger.warn(`mailer send failed: ${(e as Error).message}`);
    }
  }
}
