import { DomainException } from 'src/common/exceptions/domain.exception';

/**
 * 422 rather than 409: the request is well-formed, but the case's current state makes it
 * unprocessable. The message enumerates the legal targets so a client never has to guess.
 */
export class IllegalStatusTransitionException extends DomainException {
  constructor(
    id: string,
    from: string,
    to: string,
    allowed: readonly string[],
  ) {
    super(
      'ILLEGAL_STATUS_TRANSITION',
      `Dispute case #${id} cannot move from '${from}' to '${to}'. ` +
        (allowed.length
          ? `Allowed from '${from}': ${allowed.join(', ')}.`
          : `'${from}' is a terminal status — no further transitions are possible.`),
      422,
    );
  }
}
