import { DomainException } from '../../common/exceptions/domain.exception';

export class AnthropicSkillNotFoundException extends DomainException {
  constructor(skillPath: string) {
    super('ANTHROPIC_SKILL_NOT_FOUND', `Skill file not found: ${skillPath}`, 500);
  }
}
