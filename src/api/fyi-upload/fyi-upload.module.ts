import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { fyiStorageModule } from '../../common/fyi-storage/fyi-storage.module';
import { FyiUploadController } from './fyi-upload.controller';

@Module({
  imports: [ConfigModule, fyiStorageModule],
  controllers: [FyiUploadController],
})
export class FyiUploadModule {}
