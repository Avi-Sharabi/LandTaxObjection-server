import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

@Module({
  imports: [HttpModule],
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AiModule {}
