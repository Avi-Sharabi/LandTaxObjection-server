import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { fyiStorageService } from '../../common/fyi-storage/fyi-storage.service';
import { UploadAllCaseDocumentsArgsDto } from '../dto/upload-all-case-documents-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

interface DocumentRow {
  id: string;
  document_type: string;
  filename: string;
  blob_storage_url: string;
  case_reference: string;
}

@Injectable()
export class UploadAllCaseDocumentsTool implements IMcpTool {
  readonly name = 'upload_all_case_documents';
  readonly timeoutMs = 120_000;
  readonly description =
    'Uploads ALL assessment documents (valuation notices) for a dispute case to FYI in one call. ' +
    'Provide case_reference (e.g. LTD-1111) or case_id. ' +
    'Stops on the first upload failure. ' +
    'Returns { uploaded, total } on full success or { uploaded, failed } on partial failure.';

  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties: {
      case_reference: {
        type: 'string',
        description: 'Human-readable case reference (e.g. LTD-1111)',
      },
      case_id: {
        type: 'string',
        description: 'UUID of the dispute case',
      },
    },
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly azureBlob: AzureBlobService,
    private readonly fyiStorage: fyiStorageService,
  ) {}

  async execute(args: Record<string, unknown>, _correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(UploadAllCaseDocumentsArgsDto, args);

    if (!dto.case_reference && !dto.case_id) {
      return {
        content: [{ type: 'text', text: 'Invalid arguments: case_reference or case_id is required' }],
        isError: true,
      };
    }

    const sql = dto.case_id
      ? `SELECT ad.id,
                'valuation_notice' AS document_type,
                REGEXP_REPLACE(ad.file_path, '^.*/', '') AS filename,
                ad.file_path AS blob_storage_url,
                dc.case_reference
         FROM assessment_documents ad
         INNER JOIN dispute_cases dc ON dc.client_id = ad.client_id
         WHERE dc.id = $1
           AND ad.file_path IS NOT NULL
         ORDER BY ad.created_at ASC`
      : `SELECT ad.id,
                'valuation_notice' AS document_type,
                REGEXP_REPLACE(ad.file_path, '^.*/', '') AS filename,
                ad.file_path AS blob_storage_url,
                dc.case_reference
         FROM assessment_documents ad
         INNER JOIN dispute_cases dc ON dc.client_id = ad.client_id
         WHERE dc.case_reference = $1
           AND ad.file_path IS NOT NULL
         ORDER BY ad.created_at ASC`;

    const param = dto.case_id ?? dto.case_reference;
    const rows: DocumentRow[] = await this.dataSource.query(sql, [param]);

    if (!rows.length) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ uploaded: [], total: 0, message: `No documents found for case ${param}` }),
        }],
      };
    }

    const uploaded: { document_type: string; filename: string; fyi_name: string; version_id: string }[] = [];

    for (const row of rows) {
      const fyi_name = `${row.case_reference} - ${row.filename.replace(/\.[^.]+$/, '')}`;
      const sasUrl = this.azureBlob.getFileUrl(row.blob_storage_url, 30);

      if (!sasUrl) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              uploaded,
              failed: {
                document_type: row.document_type,
                filename: row.filename,
                fyi_name,
                error: 'Failed to generate download URL — check Azure Blob Storage configuration',
              },
            }),
          }],
          isError: true,
        };
      }

      const versionId = await this.fyiStorage.uploadToFyi({ url: sasUrl }, fyi_name);

      if (!versionId) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              uploaded,
              failed: {
                document_type: row.document_type,
                filename: row.filename,
                fyi_name,
                error: 'FYI upload failed — verify FYI_CLIENT_CODE and credentials',
              },
            }),
          }],
          isError: true,
        };
      }

      uploaded.push({ document_type: row.document_type, filename: row.filename, fyi_name, version_id: versionId });
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ uploaded, total: uploaded.length }) }],
    };
  }
}
