export type ToolParams = Record<string, unknown>;

export interface AgentToolResult<T = unknown> {
  content: Array<{ type: 'text'; text: string }>;
  details?: T;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: ToolParams) => Promise<AgentToolResult>;
}

export interface PluginLogger {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger?: PluginLogger;
  registerTool: (tool: AgentTool, opts?: { optional?: boolean }) => void;
}
