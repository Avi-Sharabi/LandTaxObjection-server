import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { fyiStorageService } from '../../common/fyi-storage/fyi-storage.service';
import { FyiUploadArgsDto } from '../dto/fyi-upload-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

@Injectable()
export class UploadFyiTool implements IMcpTool {
  readonly name = 'upload_fyi_document';
  readonly timeoutMs = 45_000;
  readonly description =
    'Uploads a file to FYI document management. ' +
    'Provide either base64 (raw file content) OR url (HTTP/HTTPS URL, e.g. an Azure Blob SAS URL). ' +
    'Always pass document_name using the fyi_name field returned by get_case_documents (e.g. "LTD-1111 - filename"). ' +
    'Returns { version_id } on success. Only works when IS_FYI_PROD_ENABLED=true.';

  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties: {
      base64: {
        type: 'string',
        description: 'Base64-encoded file content',
      },
      url: {
        type: 'string',
        description: 'HTTP/HTTPS URL to fetch the file from (e.g. Azure Blob SAS URL returned by get_case_documents)',
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
        content: [{ type: 'text', text: 'Invalid arguments: base64 and url must be strings if provided' }],
        isError: true,
      };
    }

    if (!dto.base64 && !dto.url) {
      return {
        content: [{ type: 'text', text: 'Invalid arguments: either base64 or url must be provided' }],
        isError: true,
      };
    }

    const versionId = await this.fyiStorage.uploadToFyi(
      { base64: dto.base64, url: dto.url },
      dto.document_name,
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
