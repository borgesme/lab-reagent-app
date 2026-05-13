import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class IssueRequestDto {
  @IsDecimal({ decimal_digits: '0,3' }) actualQty!: string;
  @IsOptional() @IsString() receiverId?: string;
  @IsOptional() @IsString() witnessId?: string;
  @IsOptional() @IsString() @MaxLength(1_500_000) signatureDataUrl?: string;
}
