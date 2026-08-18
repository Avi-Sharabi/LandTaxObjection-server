import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '../../audit-log/entities/audit-log.entity';
import { DisputeStatus } from '../entities/dispute-case.entity';

/**
 * One entry on a case's history.
 *
 * Every lifecycle event already writes an `audit_logs` row, but until this DTO existed there
 * was no way to read them back — the module has no controller of its own. That left clients
 * reconstructing a timeline from whichever `*_at` columns happen to exist on the case, which
 * silently omits every step that has no column: `reports_uploaded`, `analysed`, and the
 * recording of a VG response.
 */
export class CaseAuditEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: AuditAction,
    description:
      'What happened. Not every action is a status move — see from_status/to_status.',
  })
  action: AuditAction;

  @ApiPropertyOptional({
    enum: DisputeStatus,
    nullable: true,
    description:
      'Status before the move. Null on non-transition rows and on historical rows.',
  })
  from_status: string | null;

  @ApiPropertyOptional({ enum: DisputeStatus, nullable: true })
  to_status: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Objection Submitted/waiting for a VG response',
    description:
      'Display label for to_status, resolved server-side so a client never has to map the ' +
      'enum itself. Null when the row is not a status move, or when to_status predates the ' +
      'current vocabulary.',
  })
  to_status_label: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Free text recorded with this event — what a VG response said, a closure note, or why a ' +
      'change was forced. System-written rows put a machine-readable source here instead ' +
      "(e.g. 'analyze-ai:1042'), so do not assume this is always human prose.",
  })
  notes: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'accountant',
    description: "The actor's role, or 'system' for an automated trigger.",
  })
  performed_by_role: string | null;

  // Not a UUID — mintLodgementReference produces LR-<year>-<caseprefix>-<4 digits>.
  @ApiPropertyOptional({ nullable: true, example: 'LR-2026-A1B2-4821' })
  lodgment_reference_number: string | null;

  @ApiProperty({
    description:
      'When the row was written — i.e. when the event was RECORDED. For a VG response that is ' +
      'when the accountant entered it, not when the Valuer-General replied.',
  })
  created_at: Date;
}
