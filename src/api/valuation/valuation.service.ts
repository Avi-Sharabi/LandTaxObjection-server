import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValuationRepository } from './valuation.repository';
import { SubmitAppraisalDto } from './dto/submit-appraisal.dto';
import { AppraisalResponseDto } from './dto/appraisal-response.dto';
import { DecisionOutcome } from '../valuation-notices/entities/valuation-notice.entity';
import { ValuationNoticeNotFoundException } from './exceptions/valuation-not-found.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { AppraisalAfterLodgementException } from './exceptions/appraisal-after-lodgement.exception';
import { isAtOrAfterLodgement } from '../dispute-cases/dispute-status';

const NEXT_STEP_MAP: Record<DecisionOutcome, 'US-10' | 'US-11'> = {
  [DecisionOutcome.ADVISORY]: 'US-10',
  [DecisionOutcome.OBJECTION]: 'US-11',
};

@Injectable()
export class ValuationService {
  constructor(private readonly valuationRepository: ValuationRepository) {}

  async submitAppraisal(
    dto: SubmitAppraisalDto,
    analystId: string,
  ): Promise<AppraisalResponseDto> {
    const notice = await this.valuationRepository.findNoticeById(
      dto.valuation_notice_id,
    );
    if (!notice)
      throw new ValuationNoticeNotFoundException(dto.valuation_notice_id);

    const disputeCase = await this.valuationRepository.findDisputeCaseById(
      dto.dispute_case_id,
    );
    if (!disputeCase)
      throw new DisputeCaseNotFoundException(dto.dispute_case_id);

    // The old `status === 'appraisal'` gate is gone with that status: "analysed" is written by the
    // analyze-ai job, so an equality gate would lock the appraisal out of every case the job has
    // already finished. But this step is not harmless — it writes decision_outcome, which gates the
    // objection package and discriminates an advisory close — so it still needs an upper bound.
    // Once a case is lodged the appraisal that justified the objection is history, and rewriting it
    // would retroactively change why the case was lodged.
    if (isAtOrAfterLodgement(disputeCase.status)) {
      throw new AppraisalAfterLodgementException(disputeCase.status);
    }

    const vgValue = Number(notice.assessed_land_value);
    const appraisedValue = dto.appraised_value;
    const delta = vgValue - appraisedValue;
    const outcome: DecisionOutcome =
      appraisedValue < vgValue
        ? DecisionOutcome.OBJECTION
        : DecisionOutcome.ADVISORY;
    const appraisedAt = new Date();

    notice.appraised_value = appraisedValue;
    notice.valuation_delta = delta;
    notice.decision_outcome = outcome;
    notice.analyst_notes = dto.analyst_notes ?? null;
    notice.appraised_by_id = analystId;
    notice.appraised_at = appraisedAt;
    const savedNotice = await this.valuationRepository.saveNotice(notice);

    return plainToInstance(
      AppraisalResponseDto,
      {
        valuation_notice_id: savedNotice.id,
        dispute_case_id: disputeCase.id,
        vg_value: vgValue,
        appraised_value: appraisedValue,
        valuation_delta: delta,
        decision_outcome: outcome,
        analyst_notes: savedNotice.analyst_notes,
        dispute_status: disputeCase.status,
        next_step: NEXT_STEP_MAP[outcome],
        appraised_at: appraisedAt,
      },
      { excludeExtraneousValues: true },
    );
  }
}
