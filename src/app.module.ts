import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { TypeOrmConfigService } from './config/typeorm.config';
import { AnthropicModule } from './anthropic/anthropic.module';
import { APIModule } from './api/api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}`,
        `.env`,
      ],
    }),

    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
    }),

    ScheduleModule.forRoot(),

    AnthropicModule,
    APIModule
  ],
})
export class AppModule { }