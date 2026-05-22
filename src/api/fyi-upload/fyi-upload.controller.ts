import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { fyiStorageService } from '../../common/fyi-storage/fyi-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FyiUploadDto } from './dto/fyi-upload.dto';

@ApiTags('FYI')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'fyi/upload', version: '1' })
export class FyiUploadController {
  constructor(private readonly fyiStorage: fyiStorageService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a file to FYI document management via base64 or URL' })
  @ApiBody({ type: FyiUploadDto })
  @ApiResponse({
    status: 200,
    description: 'Document uploaded successfully',
    schema: { example: { version_id: 'abc123', success: true } },
  })
  @ApiResponse({ status: 400, description: 'FYI upload failed — provide base64 or url, and check credentials' })
  async upload(@Body() body: FyiUploadDto): Promise<{ version_id: string; success: true }> {
    if (!body.base64 && !body.url) {
      throw new BadRequestException('Either base64 or url must be provided.');
    }
    const versionId = await this.fyiStorage.uploadToFyi(
      { base64: body.base64, url: body.url },
      body.document_name,
    );

    if (!versionId) {
      throw new BadRequestException(
        'FYI upload failed. Verify credentials and that IS_FYI_PROD_ENABLED is set correctly.',
      );
    }

    return { version_id: versionId, success: true };
  }
}
