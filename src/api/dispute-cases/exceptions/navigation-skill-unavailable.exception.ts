import { DomainException } from '../../../common/exceptions/domain.exception';

export class NavigationSkillUnavailableException extends DomainException {
  constructor() {
    super('NAVIGATION_SKILL_UNAVAILABLE', 'Navigation skill files unavailable', 500);
  }
}
