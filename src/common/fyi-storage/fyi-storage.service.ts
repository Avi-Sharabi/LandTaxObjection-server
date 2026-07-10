import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class fyiStorageService {
    private readonly logger = new Logger(fyiStorageService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly httpService: HttpService,
    ) { }

    private async resolveBase64(input: { base64?: string; url?: string }): Promise<string> {
        if (input.base64) return input.base64;
        const response = await firstValueFrom(
            this.httpService.get<ArrayBuffer>(input.url!, { responseType: 'arraybuffer' }),
        );
        return Buffer.from(response.data).toString('base64');
    }

    public async uploadToFyi(
        input: { base64?: string; url?: string },
        documentName?: string,
    ): Promise<string | null> {
        const resolvedName = documentName ?? 'Valuation Notice';
        const envClientCode = this.config.get<string>('FYI_CLIENT_CODE');
        const isProduction = !!envClientCode;
        const resolvedClientCode = envClientCode || 'ASHT0001';
        const mode = isProduction ? 'PRODUCTION' : 'TEST (fallback: ASHT0001)';
        const fyiHeaders = {
            'x-fyi-access-id': this.config.get('FYI_ACCESS_ID'),
            'x-fyi-access-secret': this.config.get('FYI_ACCESS_SECRET'),
            'Content-Type': 'application/json',
        };

        this.logger.log(`[Step 1] Creating FYI document: name="${resolvedName}" client_code="${resolvedClientCode}" mode=${mode}`);

        let versionId: string;
        try {
            const { data: createData } = await firstValueFrom(
                this.httpService.post(
                    `${this.config.get('FYI_BASE_URL')}/external/document`,
                    {
                        metadata: {
                            action: { value: 'upsert' },
                            data: {
                                model: {
                                    name: resolvedName,
                                    document_type: 'Pdf',
                                    client_code: resolvedClientCode,
                                },
                            },
                        },
                    },
                    { headers: fyiHeaders },
                ),
            );
            versionId = createData.data.version_id;
            this.logger.log(`[Step 1] OK — version_id=${versionId}`);
        } catch (error) {
            this.logger.error('[Step 1] Create document failed', (error as any)?.response?.data ?? (error as any)?.message);
            return null;
        }

        this.logger.log(`[Step 2] Requesting S3 upload form for version_id=${versionId}`);
        let url: string;
        let fields: Record<string, string>;
        try {
            const { data: authData } = await firstValueFrom(
                this.httpService.post(
                    `${this.config.get('FYI_BASE_URL')}/external/document`,
                    {
                        metadata: {
                            action: { value: 'uploadForm' },
                            data: { id: versionId },
                        },
                    },
                    { headers: fyiHeaders },
                ),
            );
            url = authData.data.url;
            fields = authData.data.fields;
            this.logger.log(`[Step 2] OK — S3 url=${url}`);
        } catch (error) {
            this.logger.error('[Step 2] Upload form request failed', (error as any)?.response?.data ?? (error as any)?.message);
            return null;
        }

        this.logger.log(`[Step 3] Uploading PDF to S3`);
        try {
            const resolvedBase64 = await this.resolveBase64(input);
            const buffer = Buffer.from(resolvedBase64, 'base64');
            const form = new globalThis.FormData();
            for (const [key, value] of Object.entries(fields)) {
                form.append(key, value);
            }
            form.append('file', new Blob([buffer], { type: 'application/pdf' }), `${resolvedName}.pdf`);

            const s3Response = await firstValueFrom(
                this.httpService.post(url, form, { maxBodyLength: Infinity }),
            );
            this.logger.log(`[Step 3] OK — S3 status=${s3Response.status}`);
        } catch (error) {
            this.logger.error('[Step 3] S3 upload failed', (error as any)?.response?.data ?? (error as any)?.response?.status ?? (error as any)?.message);
            return null;
        }

        return versionId;
    }
}
