import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests/:id/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @Audit({ action: 'REQUEST_APPROVE', entityType: 'Request' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.approvals.approve(id, dto, user);
  }
}
