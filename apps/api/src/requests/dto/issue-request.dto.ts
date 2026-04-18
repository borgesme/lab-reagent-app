import { IsDecimal, IsOptional, IsString } from 'class-validator';

export class IssueRequestDto {
  @IsDecimal({ decimal_digits: '0,3' }) actualQty!: string;
  @IsOptional() @IsString() receiverId?: string;
}
