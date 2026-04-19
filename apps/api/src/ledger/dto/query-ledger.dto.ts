import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class QueryLedgerDto {
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}
