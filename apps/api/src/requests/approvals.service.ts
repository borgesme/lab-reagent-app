import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalAction, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    const req = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`request is ${req.status}, not PENDING`);
    }
    await this.assertApprover(req.labId, actor);
    if (req.applicantId === actor.sub) {
      throw new ForbiddenException('cannot approve own request');
    }

    const nextStatus =
      dto.action === ApprovalAction.APPROVE
        ? RequestStatus.APPROVED
        : RequestStatus.REJECTED;

    const [approval, updated] = await this.prisma.$transaction([
      this.prisma.approval.create({
        data: {
          requestId,
          approverId: actor.sub,
          action: dto.action,
          comment: dto.comment,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          rejectedReason:
            dto.action === ApprovalAction.REJECT ? dto.comment ?? null : null,
        },
      }),
    ]);

    return { approval, request: updated };
  }

  private async assertApprover(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (!actor.roles.includes('LAB_HEAD')) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
