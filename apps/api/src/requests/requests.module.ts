import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';

@Module({
  providers: [RequestsService, ApprovalsService],
  controllers: [RequestsController, ApprovalsController],
  exports: [RequestsService, ApprovalsService],
})
export class RequestsModule {}
