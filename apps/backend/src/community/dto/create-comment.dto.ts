import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
