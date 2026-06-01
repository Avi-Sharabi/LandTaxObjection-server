import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeApiException } from '../exceptions/supporting-evidence.exceptions';

export interface ClaudeImage {
  label: string;
  base64: string | null;
}

@Injectable()
export class ClaudeVisionService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeVisionService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly skillCache = new Map<string, string>();

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
    // Strip /v1/messages suffix so the SDK can append it automatically
    const baseURL = this.config.get<string>('ANTHROPIC_API_URL')?.replace(/\/v1\/messages\/?$/, '');
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
  }

  async onModuleInit(): Promise<void> {
    const skillDir = join(__dirname, '..', '..', '..', 'skills');
    const skillFiles = [
      'se-access-constraints.md',
      'se-apportionment.md',
      'se-concession.md',
      'se-easements.md',
      'se-environmental-impacts.md',
      'se-grouping.md',
      'se-heritage.md',
      'se-other.md',
      'se-planning-issues.md',
      'se-inspection.md',
    ];

    await Promise.all(
      skillFiles.map(async (file) => {
        try {
          const content = await readFile(join(skillDir, file), 'utf-8');
          this.skillCache.set(file, content);
        } catch (e) {
          this.logger.warn(`Could not preload skill file ${file}: ${(e as Error).message}`);
        }
      }),
    );

    this.logger.log(`[ClaudeVision] Preloaded ${this.skillCache.size}/${skillFiles.length} skill files`);
  }

  loadSkill(skillFileName: string): string {
    const cached = this.skillCache.get(skillFileName);
    if (!cached) throw new ClaudeApiException('SKILL_LOAD', `Skill file not found or not preloaded: ${skillFileName}`);
    return cached;
  }

  async callClaude(
    payload: Record<string, unknown>,
    images: ClaudeImage[],
    skill: string,
    label: string,
    maxTokens = 4000,
    thinkingBudget = 2000,
  ): Promise<Record<string, unknown>> {
    this.logger.log(`[${label}] Calling Claude`);

    const content: Anthropic.Messages.ContentBlockParam[] = [
      { type: 'text', text: JSON.stringify(payload) },
    ];

    for (const img of images) {
      if (img?.base64) {
        content.push({ type: 'text', text: `[Image: ${img.label}]` });
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: img.base64 },
        });
      }
    }

    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      thinking: { type: 'enabled', budget_tokens: thinkingBudget },
      system: [{ type: 'text', text: skill, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      betas: ['interleaved-thinking-2025-05-14'],
    });

    const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.Messages.TextBlock | undefined;
    if (!textBlock?.text) throw new ClaudeApiException(label, 'no text block in response');

    const raw = textBlock.text.trim();
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return JSON.parse(clean) as Record<string, unknown>;
    } catch {
      const objStart = clean.indexOf('{');
      if (objStart !== -1) {
        let depth = 0, inStr = false, esc = false;
        for (let i = objStart; i < clean.length; i++) {
          const c = clean[i];
          if (esc) { esc = false; continue; }
          if (c === '\\' && inStr) { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === '{') depth++;
          else if (c === '}') {
            if (--depth === 0) {
              try { return JSON.parse(clean.slice(objStart, i + 1)) as Record<string, unknown>; } catch { break; }
            }
          }
        }
      }
      this.logger.error(`[${label}] JSON parse failed. Raw (first 400): ${raw.substring(0, 400)}`);
      throw new ClaudeApiException(label, 'response contained invalid JSON');
    }
  }
}
