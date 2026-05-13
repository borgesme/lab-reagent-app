import { IsInt, IsOptional, IsString, Min, Matches } from 'class-validator';

export class UpsertConfigDto {
  @IsString()
  labId!: string;

  @IsString()
  reagentId!: string;

  @Matches(/^\d+(\.\d{1,3})?$/, { message: 'safetyStock must be non-negative decimal' })
  safetyStock!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expireWarningDays?: number;
}
