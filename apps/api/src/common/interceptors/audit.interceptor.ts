import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('Audit');
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const actorId = req.user?.sub ?? null;
    const ip = req.ip;
    const reqId = req.id;
    const before = req.body ?? null;

    return next.handle().pipe(
      tap(async (after) => {
        const entityId =
          after && typeof after === 'object' && 'id' in after
            ? String((after as any).id)
            : null;
        await this.prisma.auditLog.create({
          data: {
            actorId,
            ip,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            before,
            after: after ?? null,
          },
        });
        this.logger.info(
          {
            reqId,
            userId: actorId,
            ip,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
          },
          `${meta.action} ${meta.entityType}`,
        );
      }),
    );
  }
}
