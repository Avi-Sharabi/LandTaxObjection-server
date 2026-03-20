import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';

@Injectable()
export class PdfStorageHandler {

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly azureBlobService: AzureBlobService,
    private readonly fyiStorageService: fyiStorageService,
  ) { }

  async handlePdfStorage(
    base64: string | undefined,
    caseReference: string,
    isFyiClient: boolean,
  ): Promise<string | null> {
    if (!base64) return null;
    const isFyiProdEnabled = this.config.get('IS_FYI_PROD_ENABLED') === 'true';

    if (isFyiClient) {
      return isFyiProdEnabled
        ? this.fyiStorageService.uploadToFyi(base64, caseReference)
        : this.azureBlobService.uploadToFyiDev(base64, caseReference); // simulate FYI
    }

    return await this.azureBlobService.uploadToAzureBlob(
      base64,
      caseReference,
      'dispute-cases',            // ← add folderName
      'valuation-notice.pdf',     // ← add fileName
    );
  }


}