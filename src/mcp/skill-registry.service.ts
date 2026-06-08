import * as fs from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skills = new Map<string, string>();

  constructor() {
    const skillsDir = join(__dirname, '..', 'skills');
    if (!fs.existsSync(skillsDir)) return;
    for (const file of fs.readdirSync(skillsDir)) {
      if (!file.endsWith('.md')) continue;
      const name = file.replace(/\.md$/, '');
      const content = fs.readFileSync(join(skillsDir, file), 'utf-8');
      this.skills.set(name, content);
      this.logger.log(JSON.stringify({ context: 'SkillRegistry.loaded', skill: name, length: content.length, ts: new Date().toISOString() }));
    }
  }

  getSkillContent(name: string): string {
    const content = this.skills.get(name);
    if (!content) throw new Error(`Skill '${name}' not found. Available: ${[...this.skills.keys()].join(', ')}`);
    return content;
  }

  getAllSkills(): Map<string, string> {
    return this.skills;
  }
}
