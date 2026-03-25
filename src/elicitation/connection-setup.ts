import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ConnectionConfig } from '../utils/types.js';

export async function elicitConnectionSetup(_server: McpServer): Promise<ConnectionConfig | null> {
  return null;
}
