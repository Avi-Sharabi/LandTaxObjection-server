import {
  PropertySalesException,
  type PropertySalesExceptionOptions,
} from './property-sales.exception';

export class SourceDiscoveryException extends PropertySalesException {
  constructor(message: string, options: PropertySalesExceptionOptions = {}) {
    super('DISCOVERY_FAILED', message, options);
  }
}
