import { IsOptional, IsString } from 'class-validator';

export class RejectCourseDto {
  @IsString()
  reason: string;
}

export class ApproveCourseDto {
  @IsOptional()
  @IsString()
  note?: string;
}
