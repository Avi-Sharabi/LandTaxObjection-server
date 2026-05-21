import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { fyiStorageService } from '../../common/fyi-storage/fyi-storage.service';
import { FyiUploadArgsDto } from '../dto/fyi-upload-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

@Injectable()
export class UploadFyiTool implements IMcpTool {
  readonly name = 'upload_fyi_document';
  readonly timeoutMs = 30_000;
  readonly description =
    'Uploads a base64-encoded PDF to FYI document management. ' +
    'Requires base64 content. ' +
    'Optionally accepts document_name (display label in FYI). Defaults to "Valuation Notice". ' +
    'Returns { version_id } on success. Only works when IS_FYI_PROD_ENABLED=true.';

  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['base64'],
    properties: {
      base64: {
        type: 'string',
        description: 'Base64-encoded PDF file content',
      },
      document_name: {
        type: 'string',
        description: 'Display name shown in FYI. Defaults to "Valuation Notice"',
      },
    },
  };

  constructor(private readonly fyiStorage: fyiStorageService) {}

  async execute(args: Record<string, unknown>, _correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(FyiUploadArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch {
      return {
        content: [{ type: 'text', text: 'Invalid arguments: base64 is required and must be a string' }],
        isError: true,
      };
    }

    const versionId = await this.fyiStorage.uploadToFyi(dto.base64, dto.document_name);

    if (!versionId) {
      return {
        content: [{ type: 'text', text: 'FYI upload failed. Verify credentials and IS_FYI_PROD_ENABLED flag.' }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ version_id: versionId, success: true }) }],
    };
  }
}
