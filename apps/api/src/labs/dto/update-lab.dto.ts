import { IsOptional, IsString } from 'class-validator';

export class UpdateLabDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() building?: string;
}
