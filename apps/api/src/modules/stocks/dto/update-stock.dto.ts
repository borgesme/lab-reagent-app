import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateStockDto {
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,3' }) currentQty?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
