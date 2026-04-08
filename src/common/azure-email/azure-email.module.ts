import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AzureEmailService } from './azure-email.service';

@Module({
  imports: [ConfigModule],
  providers: [AzureEmailService],
  exports: [AzureEmailService],
})
export class AzureEmailModule {}
