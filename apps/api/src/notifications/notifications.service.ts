import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export interface CreateArgs {
  recipientId: string;
  labId?: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(args: CreateArgs) {
    return this.prisma.notification.create({
      data: {
        recipientId: args.recipientId,
        labId: args.labId ?? null,
        type: args.type,
        title: args.title,
        body: args.body,
        payload: (args.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async createIfAbsent(args: CreateArgs) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dedupKey =
      (args.payload?.reagentId as string | undefined) ??
      (args.payload?.stockId as string | undefined) ??
      null;

    const existing = await this.prisma.notification.findFirst({
      where: {
        recipientId: args.recipientId,
        type: args.type,
        readAt: null,
        createdAt: { gte: startOfDay },
        ...(dedupKey
          ? {
              OR: [
                { payload: { path: ['reagentId'], equals: dedupKey } },
                { payload: { path: ['stockId'], equals: dedupKey } },
              ],
            }
          : {}),
      },
    });
    if (existing) return null;
    return this.create(args);
  }

  async listMine(actorId: string, q: QueryNotificationsDto) {
    const where: Prisma.NotificationWhereInput = { recipientId: actorId };
    if (q.unreadOnly === 'true') where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
    });
  }

  async markRead(id: string, actorId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('notification not found');
    if (n.recipientId !== actorId) throw new ForbiddenException('forbidden');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(actorId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: actorId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
