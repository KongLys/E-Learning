import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type ReferenceMaterialTypeValue = 'video' | 'youtube' | 'file';

export class CreateReferenceMaterialDto {
  @IsIn(['video', 'youtube', 'file'])
  type: ReferenceMaterialTypeValue;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Bắt buộc khi type = youtube
  @IsOptional()
  @IsString()
  externalUrl?: string;
}
