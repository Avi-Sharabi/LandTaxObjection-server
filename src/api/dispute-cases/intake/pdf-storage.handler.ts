import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
// Bug 1 fix: removed unused imports — HttpService and firstValueFrom were never used

@Injectable()
export class PdfStorageHandler {

  constructor(
    private readonly config: ConfigService,
    private readonly azureBlobService: AzureBlobService,
    private readonly fyiStorageService: fyiStorageService,
  ) { }

  async handlePdfStorage(
    base64: string | undefined,
    documentId: string,
    isFyiClient: boolean,
    caseReference: string,  // Bug 2 fix: was used in uploadToAzureBlob but never declared
  ): Promise<string | null> {
    if (!base64) return null;
    const isFyiProdEnabled = this.config.get('IS_FYI_PROD_ENABLED') === 'true';

    if (isFyiClient) {
      return isFyiProdEnabled
        ? this.fyiStorageService.uploadToFyi({ base64 }, `${caseReference} - Land Tax Assessment Notice`)
        : this.azureBlobService.uploadToFyiDev(base64, documentId);
    }

    return this.azureBlobService.uploadToAzureBlob(
      base64,
      caseReference,
      'dispute-cases',
      'valuation-notice.pdf',
    );
  }
}