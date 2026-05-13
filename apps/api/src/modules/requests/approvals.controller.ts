import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('requests/:id/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @Audit({ action: 'REQUEST_APPROVE', entityType: 'Request' })
  @ApiOperation({ summary: '审批领用申请 (APPROVE/REJECT)' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.approvals.approve(id, dto, user);
  }
}
