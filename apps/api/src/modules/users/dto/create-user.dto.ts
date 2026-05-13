import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RoleCode } from '@prisma/client';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsArray() roles?: RoleCode[];
}
