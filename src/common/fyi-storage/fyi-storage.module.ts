import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { fyiStorageService } from "./fyi-storage.service";

@Module({
    imports: [ConfigModule, HttpModule],
    providers: [fyiStorageService],
    exports: [fyiStorageService],
})
export class fyiStorageModule { }