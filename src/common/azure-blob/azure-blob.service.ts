import { Inject, Injectable } from "@nestjs/common";
import { BlobServiceClient } from '@azure/storage-blob';
import { ConfigService } from "@nestjs/config";
// common/azure-blob/azure-blob.service.ts
@Injectable()
export class AzureBlobService {
    private client: BlobServiceClient;

    constructor(private readonly config: ConfigService) {
        this.client = BlobServiceClient.fromConnectionString(
            this.config.get('AZURE_STORAGE_CONNECTION_STRING')!
        );
    }
    // Upload a file
    async uploadFile(containerName: string, blobName: string, base64: string) {
        const buffer = Buffer.from(base64, 'base64');

        const containerClient = this.client.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(buffer, buffer.length);
    }

    // Get a file URL
    getFileUrl(containerName: string, blobName: string) {
        const containerClient = this.client.getContainerClient(containerName);
        return containerClient.getBlockBlobClient(blobName).url;
    }

    // Delete a file
    async deleteFile(containerName: string, blobName: string) {
        const containerClient = this.client.getContainerClient(containerName);
        await containerClient.getBlockBlobClient(blobName).delete();
    }
}