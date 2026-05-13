import { IsArray, IsOptional, IsString } from 'class-validator';
import { RoleCode } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsArray() roles?: RoleCode[];
}
