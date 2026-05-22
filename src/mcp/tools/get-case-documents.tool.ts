import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { GetCaseDocumentsArgsDto } from '../dto/get-case-documents-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

interface DocumentRow {
  id: string;
  document_type: string;
  filename: string;
  blob_storage_url: string;
  uploaded_at: string;
  case_reference: string;
}

@Injectable()
export class GetCaseDocumentsTool implements IMcpTool {
  readonly name = 'get_case_documents';
  readonly timeoutMs = 15_000;
  readonly description =
    'Retrieves all documents for a dispute case by case_reference or case_id. ' +
    'Returns a list with document_type, filename, and a 30-minute download_url for each file. ' +
    'Use the download_url with upload_fyi_document to upload a specific document to FYI. ' +
    'Example document types: advisory_letter, valuation_notice, generated_objection.';

  readonly inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties: {
      case_reference: {
        type: 'string',
        description: 'Human-readable case reference (e.g. PROP-2024-001)',
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
  ) {}

  async execute(args: Record<string, unknown>, _correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(GetCaseDocumentsArgsDto, args);

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
                dc.case_reference,
                ad.created_at AS uploaded_at
         FROM assessment_documents ad
         INNER JOIN dispute_cases dc ON dc.client_id = ad.client_id
         WHERE dc.id = $1
           AND ad.file_path IS NOT NULL
         ORDER BY ad.created_at DESC`
      : `SELECT ad.id,
                'valuation_notice' AS document_type,
                REGEXP_REPLACE(ad.file_path, '^.*/', '') AS filename,
                ad.file_path AS blob_storage_url,
                dc.case_reference,
                ad.created_at AS uploaded_at
         FROM assessment_documents ad
         INNER JOIN dispute_cases dc ON dc.client_id = ad.client_id
         WHERE dc.case_reference = $1
           AND ad.file_path IS NOT NULL
         ORDER BY ad.created_at DESC`;

    const param = dto.case_id ?? dto.case_reference;
    const rows: DocumentRow[] = await this.dataSource.query(sql, [param]);

    const documents = rows.map((row) => ({
      id: row.id,
      document_type: row.document_type,
      filename: row.filename,
      download_url: this.azureBlob.getFileUrl(row.blob_storage_url, 30),
      uploaded_at: row.uploaded_at,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify({ documents }) }],
    };
  }
}
