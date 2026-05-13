import { IsOptional, IsString } from 'class-validator';

export class QueryConfigDto {
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsString() reagentId?: string;
}
