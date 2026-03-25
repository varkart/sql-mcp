import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function selectDatabases(
  server: McpServer,
  availableConnections: string[]
): Promise<string[]> {
  return availableConnections;
}
