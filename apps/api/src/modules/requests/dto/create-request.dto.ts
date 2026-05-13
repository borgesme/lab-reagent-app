import {
  IsDecimal,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRequestDto {
  @IsString() reagentId!: string;
  @IsString() stockId!: string;
  @IsDecimal({ decimal_digits: '0,3' }) quantity!: string;
  @IsString() @MinLength(1) unit!: string;
  @IsString() @MinLength(1) @MaxLength(500) purpose!: string;
  @IsOptional() @IsString() @MaxLength(200) projectRef?: string;
  @IsOptional() @IsString() @MaxLength(200) useLocation?: string;
}
