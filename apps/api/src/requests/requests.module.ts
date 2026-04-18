import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';

@Module({
  providers: [RequestsService, ApprovalsService, IssuesService],
  controllers: [RequestsController, ApprovalsController, IssuesController],
  exports: [RequestsService, ApprovalsService, IssuesService],
})
export class RequestsModule {}
