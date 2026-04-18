import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalAction } from '@prisma/client';

export class ApproveRequestDto {
  @IsEnum(ApprovalAction) action!: ApprovalAction;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
