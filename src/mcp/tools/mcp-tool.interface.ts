export type ToolResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

export interface IMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly timeoutMs: number;
  execute(args: Record<string, unknown>, correlationId: string): Promise<ToolResult>;
}
