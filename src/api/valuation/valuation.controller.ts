import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ValuationService } from './valuation.service';
import { SubmitAppraisalDto } from './dto/submit-appraisal.dto';
import { AppraisalResponseDto } from './dto/appraisal-response.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('valuation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'valuation', version: '1' })
export class ValuationController {
  constructor(private readonly valuationService: ValuationService) {}

  @Post('appraisal')
  @ApiOperation({ summary: 'Submit analyst appraisal and compute OBJECTION / ADVISORY decision' })
  @ApiResponse({ status: 201, type: AppraisalResponseDto, description: 'Appraisal recorded; dispute case status advanced' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Valuation notice or dispute case not found' })
  @ApiResponse({ status: 422, description: "Dispute case is not in 'appraisal' status" })
  async submitAppraisal(
    @Body() dto: SubmitAppraisalDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<AppraisalResponseDto> {
    return this.valuationService.submitAppraisal(dto, req.user.id);
  }
}
