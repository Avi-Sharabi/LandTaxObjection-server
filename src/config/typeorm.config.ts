import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  @Inject(ConfigService)
  private readonly config: ConfigService;

  public createTypeOrmOptions(): TypeOrmModuleOptions {

    console.log('DB Host:', this.config.get<string>('DB_HOST'));
    console.log('DB Port:', this.config.get<number>('DB_PORT'));
    console.log('DB Username:', this.config.get<string>('DB_USERNAME'));
    console.log('DB Name:', this.config.get<string>('DB_NAME'));
    console.log('DB Password:', this.config.get<string>('DB_PASSWORD'));
    const ENV = this.config.get<string>('NODE_ENV') || 'development';

    const sslValue =
      ENV === 'development'
        ? {}
        : {
          ssl: {
            rejectUnauthorized: false,
          },
        };

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
      synchronize: true, // never use TRUE in production!
      extra: sslValue,
    };
  }
}