import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStockDto {
  @IsString() reagentId!: string;
  @IsString() labId!: string;
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsDecimal({ decimal_digits: '0,3' }) initialQty!: string;
  @IsDecimal({ decimal_digits: '0,3' }) currentQty!: string;
  @IsString() @MinLength(1) unit!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
