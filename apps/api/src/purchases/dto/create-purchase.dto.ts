import { IsDecimal, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  reagentId!: string;

  @IsDecimal({ decimal_digits: '0,3' })
  quantity!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  unit!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
