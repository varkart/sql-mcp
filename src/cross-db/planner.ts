import type { SchemaInfo, CrossDbPlan } from '../utils/types.js';
import { buildCompactSchema } from '../sampling/prompt-builder.js';
import { logger } from '../utils/logger.js';

export async function planCrossDbQuery(
  _server: any,
  question: string,
  schemas: Map<string, SchemaInfo>
): Promise<CrossDbPlan> {
  buildSchemaContext(schemas);

  logger.debug('Planning cross-db query', { dbCount: schemas.size, question });

  const firstConn = Array.from(schemas.keys())[0];
  const plan: CrossDbPlan = {
    subQueries: [
      { connectionId: firstConn, sql: 'SELECT * FROM table LIMIT 10' }
    ],
    mergeStrategy: {
      type: 'append'
    }
  };

  logger.debug('Cross-db plan generated', { plan });

  return plan;
}

function buildSchemaContext(schemas: Map<string, SchemaInfo>): string {
  const lines: string[] = [];

  for (const [connId, schema] of schemas.entries()) {
    lines.push(`\nDatabase: ${connId} (${schema.databaseType})`);
    lines.push(buildCompactSchema(schema));
  }

  return lines.join('\n');
}
