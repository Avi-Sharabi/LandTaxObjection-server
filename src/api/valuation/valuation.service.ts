import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValuationRepository } from './valuation.repository';
import { SubmitAppraisalDto } from './dto/submit-appraisal.dto';
import { AppraisalResponseDto } from './dto/appraisal-response.dto';
import { DecisionOutcome } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { ValuationNoticeNotFoundException } from './exceptions/valuation-not-found.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { InvalidDisputeStatusException } from './exceptions/invalid-dispute-status.exception';

const NEXT_STEP_MAP: Record<DecisionOutcome, 'US-10' | 'US-11'> = {
  [DecisionOutcome.ADVISORY]: 'US-10',
  [DecisionOutcome.OBJECTION]: 'US-11',
};

@Injectable()
export class ValuationService {
  constructor(private readonly valuationRepository: ValuationRepository) {}

  async submitAppraisal(dto: SubmitAppraisalDto, analystId: string): Promise<AppraisalResponseDto> {
    const notice = await this.valuationRepository.findNoticeById(dto.valuation_notice_id);
    if (!notice) throw new ValuationNoticeNotFoundException(dto.valuation_notice_id);

    const disputeCase = await this.valuationRepository.findDisputeCaseById(dto.dispute_case_id);
    if (!disputeCase) throw new DisputeCaseNotFoundException(dto.dispute_case_id);

    if (disputeCase.status !== DisputeStatus.APPRAISAL) {
      throw new InvalidDisputeStatusException(disputeCase.status);
    }

    const vgValue = Number(notice.assessed_land_value);
    const appraisedValue = dto.appraised_value;
    const delta = vgValue - appraisedValue;
    const outcome: DecisionOutcome =
      appraisedValue < vgValue ? DecisionOutcome.OBJECTION : DecisionOutcome.ADVISORY;
    const appraisedAt = new Date();

    notice.appraised_value = appraisedValue;
    notice.valuation_delta = delta;
    notice.decision_outcome = outcome;
    notice.analyst_notes = dto.analyst_notes ?? null;
    notice.appraised_by_id = analystId;
    notice.appraised_at = appraisedAt;
    const savedNotice = await this.valuationRepository.saveNotice(notice);

    disputeCase.status =
      outcome === DecisionOutcome.OBJECTION
        ? DisputeStatus.OBJECTION_PACKAGE_PREPARED
        : DisputeStatus.ADVISORY_LETTER_ISSUED;
    const savedCase = await this.valuationRepository.saveDisputeCase(disputeCase);

    return plainToInstance(AppraisalResponseDto, {
      valuation_notice_id: savedNotice.id,
      dispute_case_id: savedCase.id,
      vg_value: vgValue,
      appraised_value: appraisedValue,
      valuation_delta: delta,
      decision_outcome: outcome,
      analyst_notes: savedNotice.analyst_notes,
      dispute_status: savedCase.status,
      next_step: NEXT_STEP_MAP[outcome],
      appraised_at: appraisedAt,
    }, { excludeExtraneousValues: true });
  }
}
