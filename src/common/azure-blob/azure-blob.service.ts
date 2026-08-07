import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lookup as mimeLookup } from 'mime-types';
import { Readable } from "stream";
import { InvalidConfigurationException } from "../exceptions/invalid-configuration.exception";

export interface BlobStream {
    stream: Readable;
    /** Blob size, when Azure reports it — lets callers declare Content-Length. */
    contentLength?: number;
}


@Injectable()
export class AzureBlobService {
    private client: BlobServiceClient;
    private containerName: string;
    private accountName: string;
    private accountKey: string;

    constructor(private readonly config: ConfigService) {
        const connectionString = this.config.get('AZURE_STORAGE_CONNECTION_STRING')!;
        this.client = BlobServiceClient.fromConnectionString(connectionString);
        this.containerName = this.config.get('AZURE_CONTAINER_NAME') ?? 'documents';
        this.accountName = this.extractFromConnectionString(connectionString, 'AccountName');
        this.accountKey = this.extractFromConnectionString(connectionString, 'AccountKey');
    }

    uploadToFyiDev(base64: string, caseReference: string) {
        return this.uploadToAzureBlob(base64, caseReference, 'dispute-cases-fyi-dev', 'valuation-notice.pdf');
    }

    public async uploadToAzureBlob(
        base64: string,
        caseReference: string,
        folderName: string,
        fileName: string,
    ): Promise<string | null> {
        const blobName = `${folderName}/${caseReference}/${fileName}`;
        return this.uploadFile(blobName, base64);
    }

    private extractFromConnectionString(connectionString: string, key: string): string {
        const match = connectionString.match(new RegExp(`${key}=([^;]+)`));
        if (!match) throw new InvalidConfigurationException(`Unable to extract ${key} from connection string`);
        return match[1];
    }

    async uploadFile(blobName: string, base64: string): Promise<string | null> {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(base64Data, 'base64');

        const containerClient = this.client.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const contentType = mimeLookup(blobName) || 'application/octet-stream';
        await blockBlobClient.upload(buffer, buffer.length, {
            blobHTTPHeaders: { blobContentType: contentType },
        });

        return blobName;
    }

    getFileUrl(blobName: string | null, expiresInMinutes = 60, contentDisposition?: string): string | null {
        if (!blobName) return null;
        const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);

        const sasToken = generateBlobSASQueryParameters({
            containerName: this.containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'),
            expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
            ...(contentDisposition && { contentDisposition }),
        }, sharedKeyCredential).toString();

        return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasToken}`;
    }

    /**
     * Streaming counterpart to getFileContent — hands back the readable rather
     * than concatenating it into a Buffer, so peak memory is one chunk instead
     * of one whole file. Used by the document download endpoint.
     *
     * Every per-call value stays local: this service is a DEFAULT-scope
     * singleton, so caching the blob client or the stream on `this` would let a
     * concurrent request read another caller's bytes.
     */
    async getFileStream(blobName: string): Promise<BlobStream> {
        const containerClient = this.client.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        const downloadResponse = await blockBlobClient.download(0);
        return {
            // readableStreamBody is typed as NodeJS.ReadableStream but is a Node
            // Readable at runtime (it is the HTTP response body), which is what
            // StreamableFile requires.
            stream: downloadResponse.readableStreamBody as Readable,
            contentLength: downloadResponse.contentLength,
        };
    }

    async deleteFile(blobName: string): Promise<void> {
        const containerClient = this.client.getContainerClient(this.containerName);
        await containerClient.getBlockBlobClient(blobName).delete();
    }

    async getFileContent(blobName: string | null): Promise<Buffer> {
        if (!blobName) return Buffer.alloc(0);
        const containerClient = this.client.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        const downloadResponse = await blockBlobClient.download(0);

        const chunks: Buffer[] = [];
        for await (const chunk of downloadResponse.readableStreamBody!) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        return Buffer.concat(chunks);
    }
}