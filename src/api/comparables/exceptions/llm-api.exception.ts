import { DomainException } from '../../../common/exceptions/domain.exception';

export class LlmApiException extends DomainException {
  constructor(message: string, statusCode = 502) {
    super('LLM_API_ERROR', message, statusCode);
  }
}
