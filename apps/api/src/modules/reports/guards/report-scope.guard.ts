import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  REPORT_SCOPE_MATRIX,
  resolveReportScope,
  type ReportType,
  type RoleCode,
} from '@app/shared';
import { REPORT_SCOPE_KEY } from '../decorators/report-scope.decorator';

@Injectable()
export class ReportScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const reportType = this.reflector.getAllAndOverride<ReportType>(
      REPORT_SCOPE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!reportType) return true;

    const req = ctx.switchToHttp().getRequest();
    const jwtUser = req.user as { sub: string; roles: string[] } | undefined;
    if (!jwtUser) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: { id: true, labId: true },
    });
    if (!dbUser) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    const resolved = resolveReportScope(
      {
        id: dbUser.id,
        labId: dbUser.labId,
        roles: jwtUser.roles as RoleCode[],
      },
      reportType,
    );
    if (!resolved) {
      throw new ForbiddenException({ code: 'REPORT_SCOPE_DENIED' });
    }

    req.reportScope = resolved;
    return true;
  }
}

export { REPORT_SCOPE_MATRIX };
