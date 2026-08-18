import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDisputeCaseDto } from './create-dispute-case.dto';

/**
 * `status` is deliberately omitted. PATCH applies its payload with Object.assign, so allowing
 * status here would let a caller move a case to any status, bypassing the transition table along
 * with every side effect a transition owns — the lodgement reference and the VG email, closed_at
 * and the advisory letter, the follow-up counter resets, and the audit row.
 *
 * Status changes go through PATCH /v1/dispute-cases/:id/status
 * (DisputeStatusTransitionService.applyManual), which is the only writer of those effects.
 *
 * Note global validation runs with forbidNonWhitelisted, so a request that still sends
 * `status` is rejected with 400 rather than silently stripped.
 */
export class UpdateDisputeCaseDto extends PartialType(
  OmitType(CreateDisputeCaseDto, ['status'] as const),
) {}
