import {
  type PropertySalesErrorCode,
  PropertySalesException,
} from './property-sales.exception';

interface DescribedPropertySalesError {
  readonly code: PropertySalesErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

export function describePropertySalesError(
  value: unknown,
): DescribedPropertySalesError {
  if (value instanceof PropertySalesException) {
    return {
      code: value.code as PropertySalesErrorCode,
      message: value.message,
      ...(value.context ? { context: { ...value.context } } : {}),
    };
  }
  if (value instanceof Error) {
    return { code: 'UNEXPECTED', message: value.message };
  }
  return { code: 'UNEXPECTED', message: String(value) };
}
