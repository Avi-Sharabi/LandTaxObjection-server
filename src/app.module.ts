import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { TypeOrmConfigService } from './config/typeorm.config';
import { APIModule } from './api/api.module';
import { McpModule } from './mcp/mcp.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './common/redis/redis.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

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
    QueueModule,
    RedisModule,

    APIModule,
    McpModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}