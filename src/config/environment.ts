import { ConfigService } from '@nestjs/config';

export const isProduction = (config: ConfigService): boolean =>
  config.get<string>('NODE_ENV') === 'production';
