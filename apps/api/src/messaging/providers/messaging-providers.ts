import { IsOptional } from 'class-validator';

export class MessengerProvider {
  @IsOptional()
  _?: unknown;
}

export class ZaloOaProvider {
  @IsOptional()
  _?: unknown;
}

export class ZbsTemplateProvider {
  @IsOptional()
  _?: unknown;
}

