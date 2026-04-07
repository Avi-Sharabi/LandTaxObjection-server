import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { DisputeCasesService } from './dispute-cases.service';
import { CreateDisputeCaseDto } from './dto/create-dispute-case.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';


@ApiTags('dispute-cases')
@Controller({
  path: 'dispute-cases',
  version: '1',
})
export class DisputeCasesController {
  constructor(private readonly disputeCasesService: DisputeCasesService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createDisputeCaseDto: CreateDisputeCaseDto) {
    return this.disputeCasesService.create(createDisputeCaseDto);
  }

  /**
   * Submit a new dispute case via intake form
   * Accepts application/json with base64-encoded PDF
   */
  @ApiOperation({ summary: 'Submit a new dispute intake application', description: 'Creates a new dispute case with client, property, and legal grounds' })
  @ApiBody({ type: CreateDisputeIntakeDto })
  @ApiCreatedResponse({ description: 'Dispute case successfully created' })
  @ApiResponse({ status: 400, description: 'Validation error - missing required fields or invalid PDF' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Post('intake/submit')
  async submitIntake(@Body() intakeDto: CreateDisputeIntakeDto) {


    // Validate PDF if provided
    if (intakeDto.attachment) {

      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      if (!base64Regex.test(intakeDto.attachment)) {
        throw new BadRequestException('Invalid base64 format for PDF');
      }

    }

    return this.disputeCasesService.submitIntakeApplication(intakeDto);
  }
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.disputeCasesService.findAll();
  }

  @Get('advisory-view/:token')
  @ApiOperation({ summary: 'Get advisory letter PDF via secure token (public, 72hr expiry)' })
  @ApiParam({ name: 'token', description: 'HMAC-signed document access token' })
  @ApiResponse({ status: 200, description: 'PDF URL and case metadata returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  getAdvisoryViewDocument(@Param('token') token: string) {
    return this.disputeCasesService.getAdvisoryViewDocument(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disputeCasesService.findOneWithReportUrl(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDisputeCaseDto: UpdateDisputeCaseDto) {
    return this.disputeCasesService.update(id, updateDisputeCaseDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/advance-to-appraisal')
  @ApiOperation({ summary: 'Advance a dispute case to valuation appraisal' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 201, description: 'Case advanced to appraisal' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({ status: 422, description: 'Fewer than 3 comparable sales exist' })
  advanceToAppraisal(@Param('id') id: string) {
    return this.disputeCasesService.advanceToAppraisal(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/close-no-objection')
  @ApiOperation({
    summary: 'Close a dispute case with no objection',
    description:
      'Closes the dispute case when the internal assessment value is at or above the VG assessed value, ' +
      'indicating no viable objection grounds.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: CloseNoObjectionDto })
  @ApiResponse({ status: 200, description: 'Case closed — no objection warranted', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 400, description: 'Internal assessment value is not below the VG assessed value' })
  @ApiResponse({ status: 409, description: 'Case is already closed' })

  closeNoObjection(
    @Param('id') id: string,
    @Body() dto: CloseNoObjectionDto,
  ): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.closeNoObjection(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.disputeCasesService.remove(id);
  }
}
