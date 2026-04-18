import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const actorId = req.user?.sub ?? null;
    const ip = req.ip;
    const before = req.body ?? null;

    return next.handle().pipe(
      tap(async (after) => {
        await this.prisma.auditLog.create({
          data: {
            actorId,
            ip,
            action: meta.action,
            entityType: meta.entityType,
            entityId:
              after && typeof after === 'object' && 'id' in after
                ? String((after as any).id)
                : null,
            before,
            after: after ?? null,
          },
        });
      }),
    );
  }
}
