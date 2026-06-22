import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [HttpModule.register({ timeout: 8_000 })],
  controllers: [LocationController],
  providers: [LocationService],
})
export class LocationModule {}
