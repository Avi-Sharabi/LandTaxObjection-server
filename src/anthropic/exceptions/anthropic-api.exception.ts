import { DomainException } from '../../common/exceptions/domain.exception';

export class AnthropicApiException extends DomainException {
  constructor(upstreamStatus: number) {
    const isRateLimited = upstreamStatus === 429;
    super(
      isRateLimited ? 'ANTHROPIC_RATE_LIMITED' : 'ANTHROPIC_API_ERROR',
      `Anthropic API returned HTTP ${upstreamStatus}`,
      isRateLimited ? 503 : 502,
    );
  }
}
