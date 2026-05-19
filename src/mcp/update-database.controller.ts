import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { McpAuthGuard } from './mcp-auth.guard';
import { SkillRegistryService } from './skill-registry.service';
import { UpdateDatabaseService } from './update-database.service';
import { UpdateDatabaseArgsDto } from './dto/tool-args.dto';

@ApiTags('AI Tools')
@Controller({ path: 'update-database', version: '1' })
@UseGuards(McpAuthGuard)
export class UpdateDatabaseController {
  constructor(
    private readonly skillRegistry: SkillRegistryService,
    private readonly updateDatabaseService: UpdateDatabaseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI database write',
    description:
      'Pass plain-text instructions. Claude reasoning mode interprets them using the update-database skill and executes the update. ' +
      'Returns the write-back schema defined in update-database.md.',
  })
  async handle(@Body() body: UpdateDatabaseArgsDto): Promise<object> {
    const skillContent = this.skillRegistry.getSkillContent('update-database');
    const result = await this.updateDatabaseService.execute(
      body as unknown as Record<string, unknown>,
      skillContent,
      randomUUID(),
    );
    return JSON.parse(result.content[0].text) as object;
  }
}
