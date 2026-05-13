import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalAction } from '@prisma/client';

export class ApproveRequestDto {
  @IsEnum(ApprovalAction) action!: ApprovalAction;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2]) level?: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
