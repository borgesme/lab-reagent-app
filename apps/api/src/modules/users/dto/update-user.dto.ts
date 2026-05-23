import { IsArray, IsOptional, IsString, ValidateIf } from 'class-validator';
import { RoleCode } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  // null 表示"调离实验室"；字符串表示新的 labId；undefined 表示不动
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  labId?: string | null;
  @IsOptional() @IsArray() roles?: RoleCode[];
}
