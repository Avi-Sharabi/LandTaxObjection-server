import { DomainException } from '../../../common/exceptions/domain.exception';

export class LlmParseException extends DomainException {
  constructor(reason: string) {
    super('LLM_PARSE_FAILED', `Failed to parse LLM JSON response: ${reason}`, 502);
  }
}
