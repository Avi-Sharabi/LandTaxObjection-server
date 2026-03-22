import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { blob } from "stream/consumers";

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

    uploadToFyiDev(base64: string, documentId: string) {
        return this.uploadToAzureBlob(base64, documentId, 'assessment-documents-fyi-dev');
    }

uploadToAzureBlob
    public (
        base64: string,
        documentId: string,
        folderName = 'assessment-documents',
    ): string | null {
        const blobName = `${folderName}/${documentId}/valuation-notice.pdf`;
        // const blobName = `${folderName}/${caseReference}/valuation-notice-${Date.now()}.pdf`;
        this.uploadFile(blobName, base64);
        return blobName;
    }
    private extractFromConnectionString(connectionString: string, key: string): string {
        const match = connectionString.match(new RegExp(`${key}=([^;]+)`));
        if (!match) throw new Error(`Unable to extract ${key} from connection string`);
        return match[1];
    }

    async uploadFile(blobName: string, base64: string): Promise<string | null> {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(base64Data, 'base64');

        const containerClient = this.client.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(buffer, buffer.length);

        return this.getFileUrl(blobName);
    }

    getFileUrl(blobName: string | null, expiresInMinutes = 60): string | null {

        if (!blobName) return null
        const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);

        const sasToken = generateBlobSASQueryParameters({
            containerName: this.containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'),
            expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
        }, sharedKeyCredential).toString();

        return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasToken}`;
    }

    async deleteFile(blobName: string): Promise<void> {
        const containerClient = this.client.getContainerClient(this.containerName);
        await containerClient.getBlockBlobClient(blobName).delete();
    }

    async getFileContent(blobName: string | null): Promise<Buffer> {
        if (!blobName) return Buffer.alloc(0); // Return empty buffer if blobName is null
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