import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ObjectionPackageService } from './objection-package.service';
import { DocumentsResponseDto } from './dto/documents-response.dto';

@ApiTags('objection-package')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_Assessor, UserRole.ACCOUNTANT)
@Controller({
  path: 'dispute-cases/:disputeCaseId/objection-package',
  version: '1',
})
export class ObjectionPackageController {
  constructor(
    private readonly objectionPackageService: ObjectionPackageService,
  ) {}

  @Get('documents')
  @ApiOperation({
    summary:
      'List objection package documents with pre-signed Azure Blob URLs (30 min)',
  })
  @ApiParam({ name: 'disputeCaseId', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: DocumentsResponseDto })
  @ApiResponse({
    status: 403,
    description:
      'Case has not reached the ANALYSED stage of its lifecycle, its appraisal decision is not ' +
      'OBJECTION, or the caller holds an unauthorised role',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  getDocuments(
    @Param('disputeCaseId') disputeCaseId: string,
  ): Promise<DocumentsResponseDto> {
    return this.objectionPackageService.getDocuments(disputeCaseId);
  }
}
