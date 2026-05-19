import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface AnthropicCallOptions {
  systemBlocks: { text: string; cached?: boolean }[];
  userMessage: string;
  maxTokens?: number;
  thinking?: { budgetTokens: number };
  mcpServers?: boolean;
}

export interface AnthropicCallResult {
  text: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

interface AnthropicApiResponse {
  stop_reason: string;
  content: { type: string; text?: string }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

@Injectable()
export class AnthropicService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async call(options: AnthropicCallOptions): Promise<AnthropicCallResult> {
    const { systemBlocks, userMessage, maxTokens = 4000, thinking, mcpServers } = options;

    let betaHeader = 'mcp-client-2025-04-04,prompt-caching-2024-07-31';
    if (thinking) betaHeader += ',interleaved-thinking-2025-05-14';

    const system = systemBlocks.map((block) => ({
      type: 'text',
      text: block.text,
      ...(block.cached !== false ? { cache_control: { type: 'ephemeral' } } : {}),
    }));

    const mcpBaseUrl = mcpServers ? this.config.get<string>('MCP_PUBLIC_URL') : null;
    const mcpUrl = mcpBaseUrl ? `${mcpBaseUrl}/api/mcp` : null;
    const mcpToken = mcpUrl ? this.config.get<string>('MCP_SECRET_TOKEN') : null;

    const body: Record<string, unknown> = {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    };

    if (thinking) {
      body['thinking'] = { type: 'enabled', budget_tokens: thinking.budgetTokens };
    }

    if (mcpUrl && mcpToken) {
      body['mcp_servers'] = [
        { type: 'url', url: mcpUrl, name: 'postgres', authorization_token: mcpToken },
      ];
    }

    const response = await firstValueFrom(
      this.http.post<AnthropicApiResponse>(
        this.config.getOrThrow<string>('ANTHROPIC_API_URL'),
        body,
        {
          headers: {
            'x-api-key': this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01',
            'anthropic-beta': betaHeader,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const { stop_reason, content, usage } = response.data;
    const textBlock = content?.findLast((b) => b.type === 'text');

    return {
      text: textBlock?.text ?? '',
      stopReason: stop_reason,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
      },
    };
  }

  parseJsonObject<T>(text: string): T {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const source = fenceMatch ? fenceMatch[1] : text;
    const jsonMatch = source.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    return JSON.parse(jsonMatch[0]) as T;
  }

  parseJsonArray<T>(text: string): T[] {
    let arrayStart = -1;
    for (let i = text.indexOf('['); i !== -1; i = text.indexOf('[', i + 1)) {
      const next = text.slice(i + 1).trimStart();
      if (next.startsWith('{') || next.startsWith(']')) { arrayStart = i; break; }
    }
    if (arrayStart === -1) throw new Error('No JSON array found in response');

    let arrayEnd = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = arrayStart; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') { if (--depth === 0) { arrayEnd = i; break; } }
    }
    if (arrayEnd === -1) throw new Error('JSON array was not properly closed');

    return JSON.parse(text.slice(arrayStart, arrayEnd + 1)) as T[];
  }
}
