import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class fyiStorageService {
    private client: BlobServiceClient;
    private containerName: string;
    private accountName: string;
    private accountKey: string;

    constructor(
        private readonly config: ConfigService,
        private readonly httpService: HttpService,
    ) { }

    public async uploadToFyi(
        base64: string,
        documentId: string,
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
                                    name: `${documentId} Valuation Notice`,
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
                `${documentId}.pdf`,
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
}