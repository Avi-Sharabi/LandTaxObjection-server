import { DomainException } from '../../common/exceptions/domain.exception';

export class AnthropicInvalidResponseException extends DomainException {
  constructor(reason: string) {
    super('ANTHROPIC_INVALID_RESPONSE', `Anthropic returned an invalid response: ${reason}`, 502);
  }
}
