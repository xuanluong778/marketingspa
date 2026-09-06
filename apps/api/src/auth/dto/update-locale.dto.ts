import { IsIn } from 'class-validator';

export class UpdateLocaleDto {
  @IsIn(['vi', 'en'])
  locale!: 'vi' | 'en';
}
