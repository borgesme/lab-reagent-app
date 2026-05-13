import { IsOptional, IsString } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class ControlledAuditQueryDto extends ReportQueryDto {
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() actorId?: string;
}
