import { Module } from '@nestjs/common';
import { ReagentsService } from './reagents.service';
import { ReagentsController } from './reagents.controller';

@Module({
  providers: [ReagentsService],
  controllers: [ReagentsController],
  exports: [ReagentsService],
})
export class ReagentsModule {}
