import { DomainException } from './domain.exception';
import { ConstraintType } from '../entities/site-constraints.entity';

export class DuplicateConstraintException extends DomainException {
  constructor(constraintType: ConstraintType, disputeId: string) {
    super(
      `Constraint '${constraintType}' already exists on dispute ${disputeId}.`,
    );
  }
}