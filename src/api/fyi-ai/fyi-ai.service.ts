import { randomUUID } from 'crypto';
import axios from 'axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetCaseDocumentsTool } from '../../mcp/tools/get-case-documents.tool';
import { UploadAllCaseDocumentsTool } from '../../mcp/tools/upload-all-case-documents.tool';
import { UploadFyiTool } from '../../mcp/tools/upload-fyi.tool';

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface AnthropicApiResponse {
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  content: ContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

type Message = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

const SYSTEM_PROMPT =
  'You are an AI assistant for the LandTax Valuation Dispute system. ' +
  'You help accountants manage FYI document uploads for dispute cases.\n\n' +
  'When given a case reference (e.g. LTD-1111), use the tools to act on it directly. ' +
  'Always call the appropriate tool — do not describe what you would do, just do it. ' +
  'Summarise the result clearly at the end.';

const MAX_ITERATIONS = 10;

@Injectable()
export class FyiAiService {
  private readonly logger = new Logger(FyiAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly uploadAllTool: UploadAllCaseDocumentsTool,
    private readonly getCaseDocumentsTool: GetCaseDocumentsTool,
    private readonly uploadFyiTool: UploadFyiTool,
  ) {}

  async chat(message: string): Promise<{ response: string; usage: AnthropicApiResponse['usage'] }> {
    const apiUrl = this.config.getOrThrow<string>('ANTHROPIC_API_URL');
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');

    const toolDefinitions = [
      { name: this.uploadAllTool.name,          description: this.uploadAllTool.description,          input_schema: this.uploadAllTool.inputSchema },
      { name: this.getCaseDocumentsTool.name,   description: this.getCaseDocumentsTool.description,   input_schema: this.getCaseDocumentsTool.inputSchema },
      { name: this.uploadFyiTool.name,          description: this.uploadFyiTool.description,          input_schema: this.uploadFyiTool.inputSchema },
    ];

    const messages: Message[] = [{ role: 'user', content: message }];
    let accumulatedUsage: AnthropicApiResponse['usage'] = { input_tokens: 0, output_tokens: 0 };

    this.logger.log('[FyiAi] chat started');

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let apiResponse: { data: AnthropicApiResponse };
      try {
        apiResponse = await axios.post<AnthropicApiResponse>(
          apiUrl,
          {
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            tools: toolDefinitions,
            messages,
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31',
              'Content-Type': 'application/json',
            },
          },
        );
      } catch (err: unknown) {
        const status = (err as any)?.response?.status;
        const detail = (err as any)?.response?.data ?? (err as any)?.message;
        this.logger.error(`[FyiAi] Anthropic API error status=${status}`, detail);
        throw new ServiceUnavailableException('AI service is currently unavailable. Please try again shortly.');
      }

      const { stop_reason, content, usage } = apiResponse.data;
      accumulatedUsage = {
        input_tokens: (accumulatedUsage.input_tokens ?? 0) + (usage.input_tokens ?? 0),
        output_tokens: (accumulatedUsage.output_tokens ?? 0) + (usage.output_tokens ?? 0),
        cache_creation_input_tokens: (accumulatedUsage.cache_creation_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        cache_read_input_tokens: (accumulatedUsage.cache_read_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      };

      this.logger.log(`[FyiAi] iteration=${iteration} stop_reason=${stop_reason} output_tokens=${usage.output_tokens}`);

      if (stop_reason === 'end_turn') {
        const textBlock = content.find((b) => b.type === 'text');
        return { response: textBlock?.text ?? '', usage: accumulatedUsage };
      }

      if (stop_reason === 'tool_use') {
        // Add Claude's turn (with tool_use blocks) to messages
        messages.push({ role: 'assistant', content });

        // Execute each tool call and collect results
        const toolResults: ContentBlock[] = [];
        for (const block of content) {
          if (block.type !== 'tool_use') continue;

          this.logger.log(`[FyiAi] executing tool=${block.name} input=${JSON.stringify(block.input)}`);
          const correlationId = randomUUID();
          const toolResult = await this.executeTool(block.name!, block.input ?? {}, correlationId);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id!,
            content: toolResult.text,
            is_error: toolResult.isError,
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // max_tokens or unexpected stop
      const textBlock = content.find((b) => b.type === 'text');
      return { response: textBlock?.text ?? '', usage: accumulatedUsage };
    }

    this.logger.warn('[FyiAi] reached max iterations without end_turn');
    return { response: 'The AI exceeded the maximum number of steps. Please try a more specific request.', usage: accumulatedUsage };
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    correlationId: string,
  ): Promise<{ text: string; isError?: boolean }> {
    let result;
    switch (name) {
      case this.uploadAllTool.name:
        result = await this.uploadAllTool.execute(input, correlationId);
        break;
      case this.getCaseDocumentsTool.name:
        result = await this.getCaseDocumentsTool.execute(input, correlationId);
        break;
      case this.uploadFyiTool.name:
        result = await this.uploadFyiTool.execute(input, correlationId);
        break;
      default:
        return { text: `Unknown tool: ${name}`, isError: true };
    }

    const text = result.content[0]?.text ?? '{}';
    return { text, isError: result.isError };
  }
}
