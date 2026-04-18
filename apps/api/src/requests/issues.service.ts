import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    const req = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(`request is ${req.status}, not APPROVED`);
    }
    await this.assertIssuer(req.labId, actor);

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
          actualQty: dto.actualQty,
          stockId: req.stockId,
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
