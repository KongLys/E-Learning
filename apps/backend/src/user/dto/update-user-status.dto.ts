import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['active', 'locked'])
  status: 'active' | 'locked';

  @IsOptional()
  @IsString()
  reason?: string;
}
