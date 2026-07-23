import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// Sent on every call() request today via a manual `anthropic-beta` header; kept as the same
// fixed set via the SDK's `betas` param so behavior (prompt caching, MCP, interleaved thinking)
// is unchanged by the streaming migration below.
const BETA_FLAGS = [
  'mcp-client-2025-04-04',
  'prompt-caching-2024-07-31',
  'interleaved-thinking-2025-05-14',
] as const;

export interface AnthropicCallOptions {
  systemBlocks: { text: string; cached?: boolean }[];
  userMessage: string;
  documents?: { base64: string; mediaType?: string }[];
  maxTokens?: number;
  thinkingBudgetTokens?: number;
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

@Injectable()
export class AnthropicService {
  private readonly client: Anthropic;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
    // ANTHROPIC_API_URL is the full .../v1/messages endpoint (also used directly by
    // callWithWebSearch below); the SDK wants just the base URL.
    const baseURL = this.config.get<string>('ANTHROPIC_API_URL')?.replace(/\/v1\/messages\/?$/, '');
    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      // Bumped above the SDK's 10-minute default as a safety margin for large max_tokens +
      // extended-thinking report generations; maxRetries left at the SDK default (2).
      timeout: 15 * 60 * 1000,
    });
  }

  async call(options: AnthropicCallOptions): Promise<AnthropicCallResult> {
    const { systemBlocks, userMessage, documents, maxTokens = 4000, thinkingBudgetTokens = 2000, mcpServers } = options;

    const system = systemBlocks.map((block) => ({
      type: 'text' as const,
      text: block.text,
      ...(block.cached !== false ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));

    const mcpBaseUrl = mcpServers ? this.config.get<string>('MCP_PUBLIC_URL') : null;
    const mcpUrl = mcpBaseUrl ? `${mcpBaseUrl}/api/mcp` : null;
    const mcpToken = mcpUrl ? this.config.get<string>('MCP_SECRET_TOKEN') : null;

    const userContent = documents?.length
      ? [
          ...documents.map((doc) => ({
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: (doc.mediaType ?? 'application/pdf') as 'application/pdf', data: doc.base64 },
          })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;

    // Streamed (not buffered) so bytes keep flowing for the whole generation instead of the
    // connection sitting idle until a large max_tokens + thinking response is fully ready —
    // that idle-buffered pattern is what made long report-generation calls prone to being
    // reset by network intermediaries (e.g. the Azure AI gateway ANTHROPIC_API_URL points at).
    const stream = this.client.beta.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
      thinking: { type: 'enabled', budget_tokens: thinkingBudgetTokens },
      betas: [...BETA_FLAGS],
      ...(mcpUrl && mcpToken
        ? { mcp_servers: [{ type: 'url' as const, url: mcpUrl, name: 'postgres', authorization_token: mcpToken }] }
        : {}),
    });

    const message = await stream.finalMessage();
    const { stop_reason, content, usage } = message;
    const textBlock = content?.findLast((b) => b.type === 'text');

    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: stop_reason ?? '',
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
      },
    };
  }

  async callWithWebSearch(userMessage: string, maxTokens = 2048): Promise<string> {
    const body = {
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages: [{ role: 'user', content: userMessage }],
    };

    const response = await firstValueFrom(
      this.http.post<{ content: Array<{ type: string; text?: string }> }>(
        this.config.getOrThrow<string>('ANTHROPIC_API_URL'),
        body,
        {
          headers: {
            'x-api-key': this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const textBlocks = response.data.content.filter((b) => b.type === 'text');
    return textBlocks[textBlocks.length - 1]?.text ?? '';
  }

  parseJsonObject<T>(text: string): T {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const source = fenceMatch ? fenceMatch[1] : text;

    const objectStart = source.indexOf('{');
    if (objectStart === -1) throw new Error('No JSON object found in response');

    let objectEnd = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = objectStart; i < source.length; i++) {
      const ch = source[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') { if (--depth === 0) { objectEnd = i; break; } }
    }
    if (objectEnd === -1) {
      throw new Error('JSON object was not properly closed — the response was likely truncated (check stopReason for "max_tokens")');
    }

    return JSON.parse(source.slice(objectStart, objectEnd + 1)) as T;
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
