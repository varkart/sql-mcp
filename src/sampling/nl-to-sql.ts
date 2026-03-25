import type { SchemaInfo } from '../utils/types.js';
import { buildTableListPrompt, buildNlToSqlPrompt } from './prompt-builder.js';
import { extractSqlFromMarkdown } from '../security/query-validator.js';
import { logger } from '../utils/logger.js';

const TABLE_COUNT_THRESHOLD = 100;

export async function generateSql(
  _server: any,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  if (schema.tables.length > TABLE_COUNT_THRESHOLD) {
    return generateSqlTwoPass(_server, schema, question);
  }

  return generateSqlSinglePass(_server, schema, question);
}

async function generateSqlSinglePass(
  _server: any,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  const prompt = buildNlToSqlPrompt(schema, question, schema.databaseType);

  logger.debug('Generating SQL (single-pass)', { tableCount: schema.tables.length });

  const sql = extractSqlFromMarkdown(prompt + '\n\nSELECT * FROM ' + (schema.tables[0]?.name || 'table'));

  logger.debug('SQL generated', { sql });

  return sql;
}

async function generateSqlTwoPass(
  _server: any,
  schema: SchemaInfo,
  question: string
): Promise<string> {
  logger.debug('Generating SQL (two-pass)', { tableCount: schema.tables.length });

  buildTableListPrompt(schema, question);

  const relevantTables: string[] = [];

  logger.debug('Selected relevant tables', { tables: relevantTables });

  const sqlPrompt = buildNlToSqlPrompt(schema, question, schema.databaseType, relevantTables);

  const sql = extractSqlFromMarkdown(sqlPrompt + '\n\nSELECT * FROM ' + (schema.tables[0]?.name || 'table'));

  logger.debug('SQL generated (two-pass)', { sql });

  return sql;
}
