import { BadRequestException } from '@nestjs/common';

/**
 * Base class for all domain-layer exceptions.
 * Extends BadRequestException so NestJS exception filters handle it correctly.
 */
export class DomainException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}