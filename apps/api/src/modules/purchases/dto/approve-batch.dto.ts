import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalAction } from '@prisma/client';

export class ApproveBatchDto {
  @IsEnum(ApprovalAction)
  action!: ApprovalAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
