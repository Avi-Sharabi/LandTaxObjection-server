import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

    private extractFromConnectionString(connectionString: string, key: string): string {
        const match = connectionString.match(new RegExp(`${key}=([^;]+)`));
        if (!match) throw new Error(`Unable to extract ${key} from connection string`);
        return match[1];
    }

    async uploadFile(blobName: string, base64: string): Promise<string> {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(base64Data, 'base64');

        const containerClient = this.client.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(buffer, buffer.length);

        return this.getFileUrl(blobName);
    }

    getFileUrl(blobName: string, expiresInMinutes = 60): string {
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
}