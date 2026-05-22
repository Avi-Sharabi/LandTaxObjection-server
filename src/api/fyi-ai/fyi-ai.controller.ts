import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FyiAiChatDto } from './dto/fyi-ai-chat.dto';
import { FyiAiService } from './fyi-ai.service';

@ApiTags('FYI AI')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'fyi/ai', version: '1' })
export class FyiAiController {
  constructor(private readonly fyiAiService: FyiAiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a natural language instruction to the AI to manage FYI document uploads' })
  @ApiBody({ type: FyiAiChatDto })
  @ApiResponse({
    status: 200,
    description: 'AI response with upload result summary',
    schema: {
      example: {
        response: 'I uploaded 3 documents for case LTD-1111: Advisory Letter, Valuation Notice, Generated Objection.',
        usage: { input_tokens: 420, output_tokens: 85, cache_read_input_tokens: 310 },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'AI service temporarily unavailable' })
  async chat(@Body() body: FyiAiChatDto) {
    return this.fyiAiService.chat(body.message);
  }
}
