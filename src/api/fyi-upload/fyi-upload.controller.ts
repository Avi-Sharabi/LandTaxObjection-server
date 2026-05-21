import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { fyiStorageService } from '../../common/fyi-storage/fyi-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FyiUploadDto } from './dto/fyi-upload.dto';

@ApiTags('FYI')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'fyi/upload', version: '1' })
export class FyiUploadController {
  constructor(
    private readonly fyiStorage: fyiStorageService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a base64-encoded PDF to FYI document management' })
  @ApiBody({ type: FyiUploadDto })
  @ApiResponse({
    status: 200,
    description: 'Document uploaded successfully',
    schema: { example: { version_id: 'abc123', client_code: 'XPM-CLIENT-123', success: true } },
  })
  @ApiResponse({ status: 400, description: 'FYI upload failed — check credentials and IS_FYI_PROD_ENABLED flag' })
  async upload(@Body() body: FyiUploadDto): Promise<{ version_id: string; client_code: string; success: true }> {
    const resolvedClientCode = body.client_code ?? this.config.get<string>('FYI_CLIENT_CODE') ?? '';

    const versionId = await this.fyiStorage.uploadToFyi(
      body.base64,
      body.document_id,
      body.document_name,
      resolvedClientCode,
    );

    if (!versionId) {
      throw new BadRequestException(
        'FYI upload failed. Verify credentials and that IS_FYI_PROD_ENABLED is set correctly.',
      );
    }

    return { version_id: versionId, client_code: resolvedClientCode, success: true };
  }
}
