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
import { ComputeLandTaxDto } from './dto/compute-land-tax.dto';
import { LandTaxResponseDto } from './dto/land-tax-response.dto';
import { LandTaxComputationService } from './land-tax-computation.service';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('valuation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'valuation', version: '1' })
export class ValuationController {
  constructor(
    private readonly valuationService: ValuationService,
    private readonly landTaxComputationService: LandTaxComputationService,
  ) {}

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

  @Post('compute-land-tax')
  @ApiOperation({
    summary: 'Compute NSW land tax payable for a disputed property valuation',
    description:
      'Applies the NSW Land Tax algorithm (2025–26, Revenue NSW) to a disputed land value. ' +
      'Supports the 3-year average input (Scenario 3), combined threshold across multiple properties (Scenario 1), ' +
      'and returns annual and 3-year cumulative client savings with YML fee analysis (Scenario 4). ' +
      'No database calls — pure stateless computation.',
  })
  @ApiResponse({ status: 201, type: LandTaxResponseDto, description: 'Full land tax computation result with savings analysis' })
  @ApiResponse({ status: 400, description: 'Tax year not supported, or neither vg_assessed_value nor vg_year_values provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  computeLandTax(
    @Body() dto: ComputeLandTaxDto,
  ): LandTaxResponseDto {
    return this.landTaxComputationService.computeLandTax(dto);
  }
}
