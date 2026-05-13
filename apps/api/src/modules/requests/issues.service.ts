import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { IssueRequestDto } from './dto/issue-request.dto';
import { ActorContext } from './requests.service';

@Injectable()
export class IssuesService {
  constructor(private prisma: PrismaService) {}

  async issue(
    requestId: string,
    dto: IssueRequestDto,
    actor: ActorContext,
  ) {
    const req = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { reagent: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(`request is ${req.status}, not APPROVED`);
    }
    await this.assertIssuer(req.labId, actor);

    const controlled = isControlled(req.reagent);

    if (controlled) {
      if (!dto.witnessId) {
        throw new BadRequestException(
          'witnessId is required for controlled reagents',
        );
      }
      if (
        !dto.signatureDataUrl ||
        !dto.signatureDataUrl.startsWith('data:image/')
      ) {
        throw new BadRequestException(
          'signatureDataUrl (data:image/*) required',
        );
      }
      if (dto.witnessId === actor.sub) {
        throw new BadRequestException('witness must differ from issuer');
      }
      const witness = await this.prisma.user.findUnique({
        where: { id: dto.witnessId },
        include: { roles: { include: { role: true } } },
      });
      if (!witness) throw new BadRequestException('witness not found');
      if (witness.labId !== req.labId) {
        throw new BadRequestException('witness not in same lab');
      }
      const witnessRoles = witness.roles.map((r) => r.role.code);
      const allowed = witnessRoles.some(
        (c) => c === 'LAB_HEAD' || c === 'REAGENT_ADMIN',
      );
      if (!allowed) {
        throw new BadRequestException(
          'witness must be LAB_HEAD or REAGENT_ADMIN',
        );
      }
    }

    const actualQty = new Prisma.Decimal(dto.actualQty);
    const receiverId = dto.receiverId ?? req.applicantId;

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.reagentStock.findUnique({
        where: { id: req.stockId },
      });
      if (!stock || stock.deletedAt) {
        throw new BadRequestException('stock not found');
      }
      if (actualQty.gt(stock.currentQty)) {
        throw new BadRequestException('actualQty exceeds current stock');
      }

      const issue = await tx.issueRecord.create({
        data: {
          requestId,
          issuerId: actor.sub,
          receiverId,
          witnessId: dto.witnessId ?? null,
          actualQty: dto.actualQty,
          stockId: req.stockId,
          signatureDataUrl: dto.signatureDataUrl ?? null,
        },
      });

      await tx.reagentStock.update({
        where: { id: req.stockId },
        data: { currentQty: { decrement: actualQty } },
      });

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.ISSUED },
      });

      return { issue, request: updated };
    });
  }

  private async assertIssuer(labId: string, actor: ActorContext) {
    if (actor.roles.includes('SYS_ADMIN')) return;
    if (!actor.roles.includes('REAGENT_ADMIN')) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (user?.labId !== labId) throw new ForbiddenException();
  }
}
