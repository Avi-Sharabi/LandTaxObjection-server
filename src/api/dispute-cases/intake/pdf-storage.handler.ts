import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';

@Injectable()
export class PdfStorageHandler {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly azureBlobService: AzureBlobService,
  ) { }

  async handlePdfStorage(
    base64: string | undefined,
    caseReference: string,
    isFyiClient: boolean,
  ): Promise<string | null> {
    if (!base64) return null;
    const isProd = this.config.get('NODE_ENV') === 'production';

    if (isFyiClient) {
      return isProd
        ? this.uploadToFyi(base64, caseReference)
        : this.uploadToAzureBlobDev(base64, caseReference); // simulate FYI
    }

    return this.uploadToAzureBlob(base64, caseReference);
  }

  private async uploadToAzureBlobDev(base64, caseReference) {
    return this.uploadToAzureBlob(base64, caseReference, 'dispute-cases-fyi-dev');
  }
  
  private async uploadToFyi(
    base64: string,
    caseReference: string,
  ): Promise<string | null> {
    try {
      const buffer = Buffer.from(base64, 'base64');

      // Step 1: Create document record
      const { data: createData } = await firstValueFrom(
        this.httpService.post(
          `${this.config.get('FYI_BASE_URL')}/external/document`,
          {
            metadata: {
              action: { value: 'upsert' },
              data: {
                model: {
                  name: `${caseReference} Valuation Notice`,
                  document_type: 'Pdf',
                  client_code: this.config.get('FYI_CLIENT_CODE'),
                },
              },
            },
          },
          {
            headers: {
              'x-fyi-access-id': this.config.get('FYI_ACCESS_ID'),
              'x-fyi-access-secret': this.config.get('FYI_ACCESS_SECRET'),
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const versionId = createData.data.version_id;

      // Step 2: Get S3 pre-signed upload form
      const { data: authData } = await firstValueFrom(
        this.httpService.post(
          `${this.config.get('FYI_BASE_URL')}/external/document`,
          {
            metadata: {
              action: { value: 'uploadForm' },
              data: { id: versionId },
            },
          },
          {
            headers: {
              'x-fyi-access-id': this.config.get('FYI_ACCESS_ID'),
              'x-fyi-access-secret': this.config.get('FYI_ACCESS_SECRET'),
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const { url, fields } = authData.data;

      // Step 3: Upload to S3 using native FormData (Node 18+)
      const form = new globalThis.FormData();
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value as string);
      }
      form.append(
        'file',
        new Blob([buffer], { type: 'application/pdf' }),
        `${caseReference}.pdf`,
      );

      await firstValueFrom(
        this.httpService.post(url, form, { maxBodyLength: Infinity }),
      );

      return versionId;
    } catch (error) {
      console.error('FYI upload failed:', error.message);
      return null;
    }
  }

  private async uploadToAzureBlob(
    base64: string,
    caseReference: string,
    folderName = 'dispute-cases',
  ): Promise<string | null> {
    const blobName = `${folderName}/${caseReference}/valuation-notice-${Date.now()}.pdf`;
    await this.azureBlobService.uploadFile(blobName, base64);
    return blobName;
  }
}