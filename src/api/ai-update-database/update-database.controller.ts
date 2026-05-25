import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateDatabaseChatDto } from './dto/update-database-chat.dto';
import { UpdateDatabaseService } from './update-database.service';
import { SkillRegistryService } from '../../mcp/skill-registry.service';

@ApiTags('AI Tools')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'ai/update-database', version: '1' })
export class UpdateDatabaseController {
  constructor(
    private readonly updateDatabaseService: UpdateDatabaseService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a natural language instruction to the AI to update the database' })
  @ApiBody({ type: UpdateDatabaseChatDto })
  @ApiResponse({
    status: 200,
    description: 'AI write-back result',
    schema: {
      example: {
        success: true,
        table: 'users',
        record_id: 'uuid',
        fields_updated: ['is_active'],
        previous_values: { is_active: true },
        new_values: { is_active: false },
        audit_logged: true,
        timestamp: '2026-05-25T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 503, description: 'AI service temporarily unavailable' })
  async chat(@Body() body: UpdateDatabaseChatDto): Promise<object> {
    const skillContent = this.skillRegistry.getSkillContent('update-database');
    const result = await this.updateDatabaseService.execute(
      { instruction: body.instruction },
      skillContent,
      randomUUID(),
    );
    try {
      return JSON.parse(result.content[0]?.text ?? '{}') as object;
    } catch {
      return { success: false, reason: 'AI returned an unparseable response' };
    }
  }
}
