import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { HazardLevel, ControlType } from '@prisma/client';

export class CreateReagentDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() cas?: string;
  @IsOptional() @IsString() formula?: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(HazardLevel) hazardLevel?: HazardLevel;
  @IsOptional() @IsEnum(ControlType) controlType?: ControlType;
  @IsOptional() @IsString() msdsFileUrl?: string;
}
