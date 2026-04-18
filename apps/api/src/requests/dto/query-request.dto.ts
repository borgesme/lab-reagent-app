import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class QueryRequestDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
}
