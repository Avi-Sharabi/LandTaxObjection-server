import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MsGraphService } from './ms-graph.service';

@Module({
  imports: [HttpModule],
  providers: [MsGraphService],
  exports: [MsGraphService],
})
export class MsGraphModule {}
