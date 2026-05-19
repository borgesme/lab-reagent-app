import { ArrayMinSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BatchDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
