import { Body, Controller, Param, Post } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { IssueRequestDto } from './dto/issue-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests/:id/issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Post()
  @Audit({ action: 'REQUEST_ISSUE', entityType: 'Request' })
  issue(
    @Param('id') id: string,
    @Body() dto: IssueRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.issues.issue(id, dto, user);
  }
}
