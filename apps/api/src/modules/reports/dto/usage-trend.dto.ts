import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class UsageTrendQueryDto extends ReportQueryDto {
  @IsOptional() @IsIn(['day', 'week', 'month']) groupBy?: 'day' | 'week' | 'month';
  @IsOptional() @IsString() reagentId?: string;
}
