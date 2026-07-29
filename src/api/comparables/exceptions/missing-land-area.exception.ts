import { DomainException } from '../../../common/exceptions/domain.exception';

export class MissingLandAreaException extends DomainException {
  constructor(disputeCaseId: string) {
    super('MISSING_LAND_AREA', `Could not resolve a land area for dispute case ${disputeCaseId} from any source`, 422);
  }
}
