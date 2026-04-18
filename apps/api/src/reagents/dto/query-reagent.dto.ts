import { IsOptional, IsString } from 'class-validator';

export class QueryReagentDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
}
