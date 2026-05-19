import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class SkillRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skills = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    const skillsDir = path.join(__dirname, '..', 'skills');
    try {
      await fs.promises.access(skillsDir);
    } catch {
      return;
    }
    const files = await fs.promises.readdir(skillsDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const name = file.replace(/\.md$/, '');
      const content = await fs.promises.readFile(path.join(skillsDir, file), 'utf-8');
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
