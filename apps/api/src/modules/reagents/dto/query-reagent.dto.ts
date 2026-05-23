import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryReagentDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['0', '1']) controlled?: '0' | '1';
}
