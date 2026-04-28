import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpAuthGuard } from './mcp-auth.guard';

@ApiExcludeController()
@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private mcpService: McpService) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    res.setHeader('X-MCP-Version', '1.0');
    await this.mcpService.handleRequest(req, res);
  }
}
