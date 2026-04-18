import { IsOptional, IsString } from 'class-validator';

export class QueryStockDto {
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
}
