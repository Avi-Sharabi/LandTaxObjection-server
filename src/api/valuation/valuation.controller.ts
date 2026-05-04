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
    summary: 'Compute NSW land tax payable from 3 comparable sales (Steps 2–8 of the VG algorithm)',
    description:
      'Loads 3 comparable sales from the database, runs the full NSW Land Tax algorithm (normalise → time-adjust → reconcile → ULV → taxable value → tax payable), and returns all intermediate step values. Supports optional aggregation for owners with multiple properties.',
  })
  @ApiResponse({ status: 201, type: LandTaxResponseDto, description: 'Full land tax computation result with all intermediate steps' })
  @ApiResponse({ status: 400, description: 'Weights do not sum to 1.0, duplicate comparable IDs, market_index_pct out of range, tax year not supported, or comparable missing contract_date' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute case, property, valuation notice, or comparable sale not found' })
  async computeLandTax(
    @Body() dto: ComputeLandTaxDto,
  ): Promise<LandTaxResponseDto> {
    return this.landTaxComputationService.computeLandTax(dto);
  }
}
