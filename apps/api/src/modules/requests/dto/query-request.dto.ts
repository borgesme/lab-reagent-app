import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class QueryRequestDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsIn(['0', '1']) mine?: '0' | '1';
  @IsOptional() @IsIn(['approval']) scope?: 'approval';
}
