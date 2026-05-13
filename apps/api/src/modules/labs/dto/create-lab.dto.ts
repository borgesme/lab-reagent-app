import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLabDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() building?: string;
}
