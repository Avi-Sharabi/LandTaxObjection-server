import { DomainException } from '../../../common/exceptions/domain.exception';

export class LlmTruncationException extends DomainException {
  constructor() {
    super(
      'LLM_OUTPUT_TRUNCATED',
      'LLM output was truncated before the JSON array completed — increase max_tokens or reduce result set',
      502,
    );
  }
}
