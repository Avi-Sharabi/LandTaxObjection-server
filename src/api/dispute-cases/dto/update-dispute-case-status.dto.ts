import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DisputeStatus, OutcomeResult } from '../entities/dispute-case.entity';
import { MANUAL_TRANSITION_TARGETS } from '../dispute-status';

/** Extra facts a close needs. Only accepted when moving to `case_closed`. */
export class CaseClosurePayloadDto {
  @ApiPropertyOptional({
    example: 1_200_000,
    description:
      'Assessor internal land value (AUD). Supplying it on a PRE-LODGEMENT close is what makes ' +
      'that close an advisory one: the value is checked against the VG assessed value (409 if it ' +
      'is lower, because the case then has viable grounds) and the client is emailed an advisory ' +
      'letter with a 72-hour report link. Omit it to close a case plainly — a withdrawal or a ' +
      'lapsed deadline — which records the facts and emails nobody. Ignored once a case is lodged.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  internalAssessmentValue?: number;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Assessor notes explaining the closure.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  assessorNotes?: string;

  @ApiPropertyOptional({
    enum: OutcomeResult,
    description:
      'Final result of the dispute. Drives the client letter for a post-lodgement close — this ' +
      'is how an adverse outcome reaches the client now that there is no separate declined status.',
  })
  @IsOptional()
  @IsEnum(OutcomeResult)
  outcome?: OutcomeResult;
}

/**
 * Extra facts the `vg_agreed` transition needs. NOT accepted for `vg_response_received` — its only
 * field is the agreed value, which does not exist until the VG has agreed.
 *
 * `notes` used to live here and is gone: what a response SAID is now the top-level `notes`
 * field, recorded on the audit row like every other transition's note. One field, one column,
 * one word on the UI — rather than two note fields whose difference nobody could state.
 */
export class VgResponsePayloadDto {
  @ApiPropertyOptional({
    description: 'Land value the VG agreed to (AUD). vg_agreed only.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  finalAgreedValue?: number;
}

export class UpdateDisputeCaseStatusDto {
  @ApiProperty({
    enum: DisputeStatus,
    description:
      `Target status. Normally one of: ${MANUAL_TRANSITION_TARGETS.join(', ')}. The system-written ` +
      'statuses (created, reports_uploaded, analysed) are set by intake, the document upload and ' +
      'the AI analysis job respectively, and are rejected with a 400 unless `force` is true.',
  })
  // Accepts the FULL enum, not just MANUAL_TRANSITION_TARGETS. Narrowing it here put the
  // system-target rejection ahead of the `force` check, which left an admin unable to set
  // `analysed` — so a case the AI could not find enough comparable sales for was stuck below it
  // permanently, for every actor. The restriction now lives in
  // DisputeStatusTransitionService.assertManualMoveAllowed, which the force path skips.
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @ApiPropertyOptional({
    maxLength: 4000,
    description:
      'Free text about this transition, recorded on the audit row (audit_logs.notes). Carries ' +
      'what a VG response said, why a case was closed, or why a change was forced — this is ' +
      'the only note field on the request. Required when `force` is true.',
  })
  @IsOptional()
  @IsString()
  // 4000, not the old 500: this absorbed VgResponsePayloadDto.notes, which allowed 4000, and
  // narrowing it would start rejecting VG responses that used to be accepted.
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'ADMIN ONLY correction. Bypasses the transition table and runs NO side effects — no ' +
      'lodgement reference, no emails, no counter resets. Requires `notes`. Audited as ' +
      'STATUS_FORCED. Use to fix a case that is on the wrong status, never to progress one.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({
    type: CaseClosurePayloadDto,
    description: 'case_closed only.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CaseClosurePayloadDto)
  closure?: CaseClosurePayloadDto;

  @ApiPropertyOptional({
    type: VgResponsePayloadDto,
    description: 'vg_agreed only.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VgResponsePayloadDto)
  vgResponse?: VgResponsePayloadDto;
}
