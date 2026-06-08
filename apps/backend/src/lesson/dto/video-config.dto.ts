import { IsIn } from 'class-validator';

export class VideoConfigDto {
  @IsIn(['percent_90', 'ended_autonext'])
  completionMode: 'percent_90' | 'ended_autonext';
}
