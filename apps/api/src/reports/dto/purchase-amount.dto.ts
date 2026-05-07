import { IsIn, IsOptional } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export class PurchaseAmountQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['month', 'category', 'supplier'])
  groupBy?: 'month' | 'category' | 'supplier';
}
