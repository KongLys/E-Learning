import { IsIn } from 'class-validator';

export class ResolveReportDto {
  @IsIn(['delete', 'dismiss'])
  action: 'delete' | 'dismiss';
}
