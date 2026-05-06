import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XpmService } from './xpm.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [XpmService],
  exports: [XpmService],
})
export class XpmModule {}
