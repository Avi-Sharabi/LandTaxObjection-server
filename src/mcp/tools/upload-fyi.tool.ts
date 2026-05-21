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
    'Requires base64 content and a document_id. ' +
    'Optionally accepts document_name (display label in FYI) and client_code (per-client FYI identifier). ' +
    'Returns { version_id } on success. Only works when IS_FYI_PROD_ENABLED=true.';

  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['base64', 'document_id'],
    properties: {
      base64: {
        type: 'string',
        description: 'Base64-encoded PDF file content',
      },
      document_id: {
        type: 'string',
        description: 'Unique document identifier — used as the PDF filename and FYI document name prefix',
      },
      document_name: {
        type: 'string',
        description: 'Display name in FYI. Defaults to "{document_id} Valuation Notice"',
      },
      client_code: {
        type: 'string',
        description: 'FYI client code override. Defaults to the FYI_CLIENT_CODE environment variable',
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
        content: [{ type: 'text', text: 'Invalid arguments: base64 and document_id are required strings' }],
        isError: true,
      };
    }

    const versionId = await this.fyiStorage.uploadToFyi(
      dto.base64,
      dto.document_id,
      dto.document_name,
      dto.client_code,
    );

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
