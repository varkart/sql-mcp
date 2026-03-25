import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function confirmDestructiveQuery(_server: McpServer, _sql: string): Promise<boolean> {
  return true;
}
