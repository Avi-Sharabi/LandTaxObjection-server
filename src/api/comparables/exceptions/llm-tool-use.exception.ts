import { DomainException } from '../../../common/exceptions/domain.exception';

export class LlmToolUseException extends DomainException {
  constructor() {
    super(
      'LLM_UNEXPECTED_TOOL_USE',
      'Anthropic returned stop_reason=tool_use unexpectedly — MCP server may not have handled the tool call',
      502,
    );
  }
}
