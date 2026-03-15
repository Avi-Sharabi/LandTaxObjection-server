import { BadRequestException } from '@nestjs/common';

export class InvalidStatusTransitionException extends BadRequestException {
  constructor(currentStatus: string) {
    super(`Invalid status transition from '${currentStatus}'. No further transition is allowed.`);
  }
}