import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function confirmDestructiveQuery(server: McpServer, sql: string): Promise<boolean> {
  return true;
}
