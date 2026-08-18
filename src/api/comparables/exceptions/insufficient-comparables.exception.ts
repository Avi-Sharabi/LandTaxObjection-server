import { DomainException } from '../../../common/exceptions/domain.exception';
import { MINIMUM_COMPARABLES } from '../entities/comparable-sale.entity';

/**
 * No thrower today. The comparables floor is enforced as a predicate inside
 * DisputeStatusTransitionService.markAnalysed — which cannot throw, because it runs inside a
 * BullMQ job — and surfaced to users as an INSUFFICIENT_COMPARABLES blocker on
 * GET /dispute-cases/:id/transitions. Kept because a synchronous caller of the same rule (an
 * operator-facing endpoint, say) would want exactly this shape and error code.
 */
export class InsufficientComparablesException extends DomainException {
  constructor(current: number) {
    super(
      'INSUFFICIENT_COMPARABLES',
      `At least ${MINIMUM_COMPARABLES} comparable sales are required before the analysis can complete. Currently have ${current}.`,
      422,
    );
  }
}
