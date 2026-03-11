import { Module } from "@nestjs/common";
import { AzureBlobService } from "./azure-blob.service";
import { ConfigModule } from "@nestjs/config";

@Module({
    imports: [ConfigModule],
    providers: [AzureBlobService],
    exports: [AzureBlobService],
})
export class AzureBlobModule { }