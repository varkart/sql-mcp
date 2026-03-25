import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConnectionManager } from './connections/manager.js';
import { loadConnections } from './connections/persistence.js';
import { validateQuery, classifyStatement } from './security/query-validator.js';
import { buildExecuteOptions } from './security/sandbox.js';
import { renderTable } from './visualization/ascii-table.js';
import { generateSql } from './sampling/nl-to-sql.js';
import { logger } from './utils/logger.js';
import type { ServerConfig, QueryHistoryEntry } from './utils/types.js';

const queryHistory: QueryHistoryEntry[] = [];
const MAX_HISTORY = 50;

export async function createServer() {
  const manager = new ConnectionManager();
  const server = new McpServer({
    name: 'sql-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  });

  server.tool(
    'connect_database',
    'Connect to a database',
    {
      id: z.string().describe('Connection ID'),
      type: z.enum(['postgresql', 'mysql', 'sqlite', 'mssql', 'oracle', 'mariadb']).describe('Database type'),
      name: z.string().optional().describe('Friendly name'),
      env: z.string().optional().describe('Environment label'),
      host: z.string().optional().describe('Hostname'),
      port: z.number().optional().describe('Port'),
      database: z.string().optional().describe('Database name'),
      path: z.string().optional().describe('File path (SQLite)'),
      user: z.string().optional().describe('Username'),
      password: z.string().optional().describe('Password'),
      readOnly: z.boolean().optional().describe('Read-only mode'),
      ssl: z.boolean().optional().describe('Use SSL'),
    },
    async (args) => {
      try {
        const { id, name, env, type, ...configFields } = args;

        await manager.connect(id, { type, ...configFields }, { name, env });

        const connection = manager.getConnection(id);
        const tableCount = connection?.schema?.tables.length || 0;

        return {
          content: [{
            type: 'text',
            text: `✓ Connected to ${type} database '${id}'\nTables: ${tableCount}\nRead-only: ${configFields.readOnly ?? false}`,
          }],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{
            type: 'text',
            text: `✗ Connection failed: ${err.message}`,
          }],
        };
      }
    }
  );

  server.tool(
    'disconnect_database',
    'Disconnect from a database',
    {
      id: z.string().describe('Connection ID'),
    },
    async (args) => {
      try {
        await manager.disconnect(args.id, { removePersisted: true });
        return {
          content: [{
            type: 'text',
            text: `✓ Disconnected from '${args.id}'`,
          }],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{
            type: 'text',
            text: `✗ Disconnect failed: ${err.message}`,
          }],
        };
      }
    }
  );

  server.tool(
    'list_connections',
    'List all database connections',
    {},
    async () => {
      const connections = manager.listConnections();

      if (connections.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No connections',
          }],
        };
      }

      const lines = connections.map(conn => {
        const icon = conn.status === 'connected' ? '🟢' : conn.status === 'failed' ? '🔴' : '⚪';
        const name = conn.name ? ` (${conn.name})` : '';
        const env = conn.env ? ` [${conn.env}]` : '';
        const tables = conn.schema ? ` | ${conn.schema.tables.length} tables` : '';
        const error = conn.error ? ` | Error: ${conn.error}` : '';
        const uptime = conn.connectedAt ? ` | ${formatUptime(conn.connectedAt)}` : '';

        return `${icon} ${conn.id}${name}${env} | ${conn.config.type}${tables}${uptime}${error}`;
      });

      return {
        content: [{
          type: 'text',
          text: lines.join('\n'),
        }],
      };
    }
  );

  server.tool(
    'execute_query',
    'Execute a SQL query',
    {
      connectionId: z.string().describe('Connection ID'),
      sql: z.string().describe('SQL query'),
      params: z.array(z.any()).optional().describe('Query parameters'),
      maxRows: z.number().optional().describe('Max rows to return'),
      timeout: z.number().optional().describe('Query timeout in ms'),
      format: z.enum(['table', 'json', 'raw']).optional().describe('Output format'),
    },
    async (args) => {
      try {
        const adapter = manager.getAdapter(args.connectionId);
        if (!adapter) {
          throw new Error(`Connection '${args.connectionId}' not found or not connected`);
        }

        const connection = manager.getConnection(args.connectionId);
        const readOnly = connection?.config.readOnly ?? true;

        validateQuery(args.sql, readOnly);

        const options = buildExecuteOptions(
          { queryTimeout: 30000, maxRows: 1000, readOnly },
          { timeout: args.timeout, maxRows: args.maxRows }
        );

        const result = await adapter.execute(args.sql, args.params, options);

        const statementType = classifyStatement(args.sql);
        queryHistory.unshift({
          connectionId: args.connectionId,
          sql: args.sql,
          statementType,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
          timestamp: new Date(),
        });
        if (queryHistory.length > MAX_HISTORY) {
          queryHistory.pop();
        }

        const format = args.format || 'table';
        let output: string;

        if (format === 'json') {
          output = JSON.stringify(result, null, 2);
        } else if (format === 'raw') {
          output = JSON.stringify(result.rows);
        } else {
          output = renderTable(result);
        }

        return {
          content: [{
            type: 'text',
            text: output,
          }],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{
            type: 'text',
            text: `✗ Query failed: ${err.message}`,
          }],
        };
      }
    }
  );

  server.tool(
    'nl_query',
    'Natural language to SQL query',
    {
      connectionId: z.string().describe('Connection ID'),
      question: z.string().describe('Natural language question'),
      autoExecute: z.boolean().optional().describe('Automatically execute the generated SQL'),
    },
    async (args) => {
      try {
        const schema = await manager.getSchema(args.connectionId);
        const sql = await generateSql(server as any, schema, args.question);

        if (!args.autoExecute) {
          return {
            content: [{
              type: 'text',
              text: `Generated SQL:\n\`\`\`sql\n${sql}\n\`\`\``,
            }],
          };
        }

        const adapter = manager.getAdapter(args.connectionId);
        if (!adapter) {
          throw new Error(`Connection not found`);
        }

        const connection = manager.getConnection(args.connectionId);
        const readOnly = connection?.config.readOnly ?? true;

        validateQuery(sql, readOnly);

        const result = await adapter.execute(sql, [], buildExecuteOptions(
          { queryTimeout: 30000, maxRows: 1000, readOnly },
          {}
        ));

        return {
          content: [{
            type: 'text',
            text: `Generated SQL:\n\`\`\`sql\n${sql}\n\`\`\`\n\n${renderTable(result)}`,
          }],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{
            type: 'text',
            text: `✗ NL query failed: ${err.message}`,
          }],
        };
      }
    }
  );

  server.tool(
    'describe_schema',
    'Describe database schema',
    {
      connectionId: z.string().describe('Connection ID'),
      table: z.string().optional().describe('Specific table name'),
      format: z.enum(['summary', 'detailed', 'json']).optional().describe('Output format'),
    },
    async (args) => {
      try {
        const schema = await manager.getSchema(args.connectionId);
        const format = args.format || 'summary';

        if (format === 'json') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(schema, null, 2),
            }],
          };
        }

        const tables = args.table
          ? schema.tables.filter(t => t.name === args.table)
          : schema.tables;

        if (tables.length === 0) {
          return {
            content: [{
              type: 'text',
              text: args.table ? `Table '${args.table}' not found` : 'No tables found',
            }],
          };
        }

        const lines: string[] = [];

        for (const table of tables) {
          const tableName = table.schema ? `${table.schema}.${table.name}` : table.name;
          lines.push(`\n📊 ${tableName}`);
          lines.push(`   Columns: ${table.columns.length}${table.rowCount !== undefined ? ` | Rows: ${table.rowCount}` : ''}`);

          if (format === 'detailed') {
            for (const col of table.columns) {
              const pk = col.isPrimaryKey ? ' [PK]' : '';
              const nullable = col.nullable ? ' NULL' : ' NOT NULL';
              lines.push(`   - ${col.name}: ${col.type}${nullable}${pk}`);
            }

            if (table.foreignKeys.length > 0) {
              lines.push(`   Foreign Keys:`);
              for (const fk of table.foreignKeys) {
                lines.push(`   - ${fk.column} → ${fk.referencesTable}.${fk.referencesColumn}`);
              }
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: lines.join('\n'),
          }],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{
            type: 'text',
            text: `✗ Schema description failed: ${err.message}`,
          }],
        };
      }
    }
  );

  server.resource(
    'connections-list',
    'sql://connections',
    async () => ({
      contents: [{
        uri: 'sql://connections',
        mimeType: 'application/json',
        text: JSON.stringify(manager.listConnections(), null, 2),
      }],
    })
  );

  server.resource(
    'query-history',
    'sql://history',
    async () => ({
      contents: [{
        uri: 'sql://history',
        mimeType: 'application/json',
        text: JSON.stringify(queryHistory.slice(0, MAX_HISTORY), null, 2),
      }],
    })
  );

  server.prompt(
    'explore-database',
    'Explore a database schema',
    async (_extra) => {
      const connections = manager.listConnections();
      const firstConnected = connections.find(c => c.status === 'connected');

      if (!firstConnected) {
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: 'No connected databases found. Please connect to a database first.',
            },
          }],
        };
      }

      const schema = await manager.getSchema(firstConnected.id);

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Explore the ${schema.databaseType} database '${firstConnected.id}' with ${schema.tables.length} tables. Describe the structure, show row counts, sample data, and suggest useful queries.`,
          },
        }],
      };
    }
  );

  return { server, manager };
}

export async function autoConnect(manager: ConnectionManager, config: ServerConfig | null) {
  const persisted = await loadConnections();
  const allConnections = { ...persisted };

  if (config) {
    for (const [id, entry] of Object.entries(config.connections)) {
      allConnections[id] = entry;
    }
  }

  for (const [id, entry] of Object.entries(allConnections)) {
    await manager.tryConnect(id, entry.config, {
      name: entry.name,
      env: entry.env,
    });
  }

  logger.info('Auto-connect completed', { count: Object.keys(allConnections).length });
}

function formatUptime(connectedAt: Date): string {
  const ms = Date.now() - connectedAt.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
