import { DomainException } from './domain.exception';

export class InvalidConfigurationException extends DomainException {
  constructor(detail: string) {
    super('INVALID_CONFIGURATION', `Invalid service configuration: ${detail}`, 500);
  }
}
