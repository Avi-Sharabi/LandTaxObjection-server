import {
  PropertySalesException,
  type PropertySalesExceptionOptions,
} from './property-sales.exception';

export class DatParsingException extends PropertySalesException {
  constructor(message: string, options: PropertySalesExceptionOptions = {}) {
    super('PARSE_FAILED', message, options);
  }
}
