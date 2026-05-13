import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReceiptBatchDto {
  @IsDecimal({ decimal_digits: '0,3' })
  actualQty!: string;

  @IsOptional() @IsString() @MaxLength(64) batchNo?: string;
  @IsOptional() @IsDateString() mfgDate?: string;
  @IsOptional() @IsDateString() expireDate?: string;
  @IsOptional() @IsString() @MaxLength(128) location?: string;
  @IsOptional() @IsString() @MaxLength(128) supplier?: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) purchasePrice?: string;
}
