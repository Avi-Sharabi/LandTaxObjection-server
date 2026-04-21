import { DomainException } from '../../common/exceptions/domain.exception';

export class AnthropicUnavailableException extends DomainException {
  constructor() {
    super('ANTHROPIC_UNAVAILABLE', 'Unable to reach Anthropic API — check network connectivity', 502);
  }
}
