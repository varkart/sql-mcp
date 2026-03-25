import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SchemaInfo } from '../utils/types.js';
import { buildTableListPrompt, buildNlToSqlPrompt } from './prompt-builder.js';
import { extractSqlFromMarkdown } from '../security/query-validator.js';
import { logger } from '../utils/logger.js';

const TABLE_COUNT_THRESHOLD = 100;

export async function generateSql(
  server: McpServer,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  if (schema.tables.length > TABLE_COUNT_THRESHOLD) {
    return generateSqlTwoPass(server, schema, question);
  }

  return generateSqlSinglePass(server, schema, question);
}

async function generateSqlSinglePass(
  server: McpServer,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  const prompt = buildNlToSqlPrompt(schema, question, schema.databaseType);

  logger.debug('Generating SQL (single-pass)', { tableCount: schema.tables.length });

  const response = await server.createMessage({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: prompt,
        },
      },
    ],
    maxTokens: 1000,
  });

  const content = response.content;
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from LLM');
  }

  const sql = extractSqlFromMarkdown(content.text);

  logger.debug('SQL generated', { sql });

  return sql;
}

async function generateSqlTwoPass(
  server: McpServer,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  logger.debug('Generating SQL (two-pass)', { tableCount: schema.tables.length });

  const tableSelectionPrompt = buildTableListPrompt(schema, question);

  const selectionResponse = await server.createMessage({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: tableSelectionPrompt,
        },
      },
    ],
    maxTokens: 500,
  });

  const selectionContent = selectionResponse.content;
  if (selectionContent.type !== 'text') {
    throw new Error('Unexpected response type from LLM');
  }

  let relevantTables: string[];
  try {
    const jsonMatch = selectionContent.text.match(/\[.*\]/s);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    relevantTables = JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.warn('Failed to parse table selection, using all tables', { error });
    relevantTables = [];
  }

  logger.debug('Selected relevant tables', { tables: relevantTables });

  const sqlPrompt = buildNlToSqlPrompt(schema, question, schema.databaseType, relevantTables);

  const sqlResponse = await server.createMessage({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: sqlPrompt,
        },
      },
    ],
    maxTokens: 1000,
  });

  const sqlContent = sqlResponse.content;
  if (sqlContent.type !== 'text') {
    throw new Error('Unexpected response type from LLM');
  }

  const sql = extractSqlFromMarkdown(sqlContent.text);

  logger.debug('SQL generated (two-pass)', { sql });

  return sql;
}
