import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { isProduction } from './environment';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  @Inject(ConfigService)
  private readonly config: ConfigService;

  public createTypeOrmOptions(): TypeOrmModuleOptions {

    return {
      type: 'postgres',
      host: this.config.get<string>('DB_HOST'),
      port: this.config.get<number>('DB_PORT'),
      username: this.config.get<string>('DB_USERNAME'),
      password: this.config.get<string>('DB_PASSWORD'),
      database: this.config.get<string>('DB_NAME'),
      entities: ['dist/**/*.entity.{ts,js}'],
      migrations: ['dist/migrations/*.{ts,js}'],
      migrationsTableName: 'typeorm_migrations',
      logger: 'file',
      logging: true,
      synchronize: false,
      ...((!isProduction(this.config)) && {
        ssl: {
          rejectUnauthorized: false,
        },
      }),
    };
  }
}
