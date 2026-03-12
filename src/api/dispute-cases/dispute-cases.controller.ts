import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { DisputeCasesService } from './dispute-cases.service';
import { CreateDisputeCaseDto } from './dto/create-dispute-case.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';

@ApiTags('dispute-cases')
@Controller('dispute-cases')
export class DisputeCasesController {
  constructor(private readonly disputeCasesService: DisputeCasesService) { }

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

  @Get()
  findAll() {
    return this.disputeCasesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disputeCasesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDisputeCaseDto: UpdateDisputeCaseDto) {
    return this.disputeCasesService.update(id, updateDisputeCaseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.disputeCasesService.remove(id);
  }
}
