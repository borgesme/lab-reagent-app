import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalAction, RequestStatus } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async approve(
    requestId: string,
    dto: ApproveRequestDto,
    actor: ActorContext,
  ) {
    const req = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { reagent: true, approvals: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`request is ${req.status}, not PENDING`);
    }
    if (req.applicantId === actor.sub) {
      throw new ForbiddenException('cannot approve own request');
    }

    const level = dto.level ?? 1;
    const controlled = isControlled(req.reagent);

    if (!actor.roles.includes('SYS_ADMIN')) {
      if (level === 1 && !actor.roles.includes('LAB_HEAD')) {
        throw new ForbiddenException('level=1 requires LAB_HEAD');
      }
      if (level === 2 && !actor.roles.includes('SAFETY_OFFICER')) {
        throw new ForbiddenException('level=2 requires SAFETY_OFFICER');
      }
      const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
      if (user?.labId !== req.labId) throw new ForbiddenException('cross-lab');
    }

    if (level === 2 && !controlled) {
      throw new BadRequestException(
        'level=2 not applicable to non-controlled requests',
      );
    }

    if (level === 2 && controlled) {
      const hasLevel1Approve = req.approvals.some(
        (a) => a.level === 1 && a.action === ApprovalAction.APPROVE,
      );
      if (!hasLevel1Approve) {
        throw new BadRequestException('level=1 approval required first');
      }
    }

    const isReject = dto.action === ApprovalAction.REJECT;
    const isApprove = dto.action === ApprovalAction.APPROVE;

    let nextStatus: RequestStatus = RequestStatus.PENDING;
    if (isReject) {
      nextStatus = RequestStatus.REJECTED;
    } else if (isApprove) {
      if (!controlled) {
        nextStatus = RequestStatus.APPROVED;
      } else {
        const approveLevels = new Set(
          req.approvals
            .filter((a) => a.action === ApprovalAction.APPROVE)
            .map((a) => a.level)
            .concat([level]),
        );
        if (approveLevels.has(1) && approveLevels.has(2)) {
          nextStatus = RequestStatus.APPROVED;
        }
      }
    }

    const [approval, updated] = await this.prisma.$transaction([
      this.prisma.approval.create({
        data: {
          requestId,
          approverId: actor.sub,
          action: dto.action,
          level,
          comment: dto.comment,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          rejectedReason: isReject
            ? `L${level}: ${dto.comment ?? ''}`.trim()
            : null,
        },
      }),
    ]);

    return { approval, request: updated };
  }
}
