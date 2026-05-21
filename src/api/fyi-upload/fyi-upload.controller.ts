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
  @ApiOperation({ summary: 'Upload a base64-encoded PDF to FYI document management' })
  @ApiBody({ type: FyiUploadDto })
  @ApiResponse({
    status: 200,
    description: 'Document uploaded successfully',
    schema: { example: { version_id: 'abc123', success: true } },
  })
  @ApiResponse({ status: 400, description: 'FYI upload failed — check credentials and IS_FYI_PROD_ENABLED flag' })
  async upload(@Body() body: FyiUploadDto): Promise<{ version_id: string; success: true }> {
    const versionId = await this.fyiStorage.uploadToFyi(body.base64, body.document_name, body.case_reference);

    if (!versionId) {
      throw new BadRequestException(
        'FYI upload failed. Verify credentials and that IS_FYI_PROD_ENABLED is set correctly.',
      );
    }

    return { version_id: versionId, success: true };
  }
}
