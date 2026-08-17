import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus } from '../entities/dispute-case.entity';
import { DisputeStatusOptionDto } from './dispute-status-option.dto';

export class DisputeCaseStatusTransitionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'LTD-2026-000006' })
  case_reference: string;

  @ApiProperty({ enum: DisputeStatus })
  previousStatus: DisputeStatus;

  @ApiProperty({ enum: DisputeStatus })
  status: DisputeStatus;

  @ApiProperty({ example: 'Objection Submitted/waiting for a VG response' })
  statusLabel: string;

  @ApiProperty({
    description:
      'False when the case was already on the requested status. The call is then a no-op: no ' +
      'side effects ran and no audit row was written.',
  })
  changed: boolean;

  @ApiProperty({
    type: [DisputeStatusOptionDto],
    description:
      'Manual transitions now available, so the client needs no second round trip.',
  })
  allowedNextStatuses: DisputeStatusOptionDto[];

  // snake_case throughout, matching DisputeCaseResponseDto and the rest of this API.
  //
  // @ApiProperty({nullable}), not @ApiPropertyOptional: these keys are ALWAYS present in the body,
  // they are merely nullable. Declaring them optional makes a generated client type them `?:`, so
  // consumers write `if (res.submitted_at)` guards against an absence that never happens and lose
  // the compiler's help distinguishing "not lodged" from "field missing".
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  submitted_at: Date | null;

  @ApiProperty({ nullable: true, type: String, example: 'LR-2026-A1B2-4821' })
  lodgment_reference_number: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  closed_at: Date | null;

  @ApiProperty({ example: 0 })
  resubmission_count: number;
}

/** Why a case is not moving when the next step in its lifecycle is one the system writes. */
export enum SystemTransitionBlockerCode {
  /** A document type required by the reports-uploaded gate has no uploaded file on the case. */
  MISSING_DOCUMENT_TYPE = 'MISSING_DOCUMENT_TYPE',
  /** Fewer comparable sales on file than the analysis step requires. */
  INSUFFICIENT_COMPARABLES = 'INSUFFICIENT_COMPARABLES',
}

export class SystemTransitionBlockerDto {
  @ApiProperty({ enum: SystemTransitionBlockerCode })
  code: SystemTransitionBlockerCode;

  @ApiProperty({
    enum: DisputeStatus,
    description: 'The status this blocker is holding up.',
  })
  blockedStatus: DisputeStatus;

  @ApiProperty({
    example: 'No land value search has been uploaded for this case.',
    description: 'Plain-English explanation, safe to show a user as-is.',
  })
  message: string;
}

export class DisputeCaseTransitionsResponseDto {
  @ApiProperty({ enum: DisputeStatus })
  current: DisputeStatus;

  @ApiProperty({ example: 'Analysed' })
  currentLabel: string;

  @ApiProperty({
    type: [DisputeStatusOptionDto],
    description:
      'Manual transitions legal from the current status, in lifecycle order.',
  })
  allowed: DisputeStatusOptionDto[];

  @ApiProperty({
    type: [SystemTransitionBlockerDto],
    description:
      'Why the next system-written status has not been reached. Empty when nothing is blocked, ' +
      'and always empty once the case is past the system-driven part of its lifecycle. ' +
      'reports_uploaded and analysed are written by the system, never by a status request, so ' +
      'without this a stalled case reports an empty `allowed` list with no reason — the ' +
      'diagnostic the retired advance-to-appraisal endpoint used to return as a 422.',
  })
  blockers: SystemTransitionBlockerDto[];

  @ApiProperty({
    enum: DisputeStatus,
    isArray: true,
    description:
      'Statuses this case must already have held to be sitting on `current`, including ' +
      '`current` itself — the graph dominators of the current status. Lets a client tick a ' +
      'timeline step that stamped no timestamp, without shipping a copy of the lifecycle graph ' +
      'to do it.\n\n' +
      'A LOWER BOUND, never a history. Absence means "no path guarantees it", NOT "it did not ' +
      'happen": an admin force sets a status with no graph check, and migration 1785800000000 ' +
      'remapped legacy statuses onto cases that never traversed them. Union it with whatever ' +
      'timestamps you hold, and never gate a write on it.\n\n' +
      'Note `case_closed` yields only [created, case_closed] — it is reachable from every open ' +
      'status, so it proves nothing about the middle of the lifecycle.',
  })
  impliedStatuses: DisputeStatus[];
}
