import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsIn(['30d', '90d', '365d', 'month', 'quarter', 'custom'])
  range?: '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;

  @IsOptional() @IsIn(['json', 'csv', 'xlsx']) format?: 'json' | 'csv' | 'xlsx';
  @IsOptional() @IsIn(['0', '1']) summary?: '0' | '1';
  @IsOptional() @IsString() labId?: string;
}
