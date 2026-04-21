import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { AnthropicApiException } from './exceptions/anthropic-api.exception';
import { AnthropicInvalidResponseException } from './exceptions/anthropic-invalid-response.exception';
import { AnthropicSkillNotFoundException } from './exceptions/anthropic-skill-not-found.exception';
import { AnthropicUnavailableException } from './exceptions/anthropic-unavailable.exception';

interface AnthropicApiResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
}

const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private readonly skillCache = new Map<string, string>();
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.getOrThrow<string>('ANTHROPIC_API_URL');
    this.apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
  }

  async analyse(skillPath: string, data: unknown): Promise<string> {
    const systemPrompt = this.loadSkillFile(skillPath);
    const body = {
      model: MODEL,
      max_tokens: 4096,
      // System as an array enables prompt caching — skill file content is stable
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: JSON.stringify(data, null, 2) }],
    };
    return this.callApi(body);
  }

  async generateSql(
    skillPath: string,
    propertyDetails: unknown,
  ): Promise<{ sql: string; params: unknown[] }> {
    const systemPrompt = this.loadSkillFile(skillPath);
    const userMessage = [
      'Generate a parameterised PostgreSQL SELECT query for the subject property below.',
      '',
      'Return ONLY a JSON object — no markdown fences, no explanation:',
      '{ "sql": "SELECT ... FROM property_sales_raw WHERE ... LIMIT $N", "params": [...] }',
      '',
      'Rules:',
      '- Every user-supplied value must be a $N positional parameter — never embedded in the SQL string.',
      '- Apply all field conventions from the system prompt (ALL CAPS locality/street, street-type abbreviation table, strata toggle, sale_code filter, interest filter).',
      '- Calculate the date threshold from valuationDate minus monthsLookback months — place the resulting YYYY-MM-DD string in params.',
      '',
      'Subject property:',
      JSON.stringify(propertyDetails, null, 2),
    ].join('\n');

    const body = {
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    };
    const text = await this.callApi(body);
    return this.parseGeneratedSql(text);
  }

  private async callApi(body: object): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      this.logger.error('Network failure reaching Anthropic API', err);
      throw new AnthropicUnavailableException();
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      this.logger.error(`Anthropic API error HTTP ${response.status}: ${errorText}`);
      throw new AnthropicApiException(response.status);
    }

    const result = (await response.json()) as AnthropicApiResponse;
    const textBlock = result.content.find((b) => b.type === 'text');

    if (!textBlock?.text) {
      this.logger.error('Anthropic returned no text block', JSON.stringify(result));
      throw new AnthropicInvalidResponseException('no text content in response');
    }

    return textBlock.text;
  }

  private parseGeneratedSql(text: string): { sql: string; params: unknown[] } {
    // Claude sometimes wraps JSON in markdown fences despite instructions
    const stripped = text
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch (_err: unknown) {
      throw new AnthropicInvalidResponseException('non-JSON response for SQL generation');
    }

    const obj = parsed as Record<string, unknown>;
    if (typeof obj?.sql !== 'string' || !Array.isArray(obj?.params)) {
      throw new AnthropicInvalidResponseException('SQL response missing "sql" or "params" fields');
    }

    return { sql: obj.sql, params: obj.params };
  }

  private loadSkillFile(skillPath: string): string {
    const cached = this.skillCache.get(skillPath);
    if (cached) return cached;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      this.skillCache.set(skillPath, content);
      return content;
    } catch (_err: unknown) {
      throw new AnthropicSkillNotFoundException(skillPath);
    }
  }
}
