import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SchemaInfo, CrossDbPlan } from '../utils/types.js';
import { buildCompactSchema } from '../sampling/prompt-builder.js';
import { logger } from '../utils/logger.js';

export async function planCrossDbQuery(
  server: McpServer,
  question: string,
  schemas: Map<string, SchemaInfo>
): Promise<CrossDbPlan> {
  const schemaContext = buildSchemaContext(schemas);

  const prompt = `You are a distributed query planner. You need to decompose a question into sub-queries for multiple databases and specify how to merge the results.

Available Databases and Schemas:
${schemaContext}

Question: ${question}

Generate a query plan in the following JSON format:
{
  "subQueries": [
    { "connectionId": "db1", "sql": "SELECT ..." },
    { "connectionId": "db2", "sql": "SELECT ..." }
  ],
  "mergeStrategy": {
    "type": "union" | "append" | "join",
    "joinColumns": ["column1", "column2"]  // only for join type
  }
}

Merge strategy types:
- "union": Combine results and remove duplicates (same schema required)
- "append": Concatenate results (different schemas OK, will merge column sets)
- "join": Hash join on specified columns

Respond with only the JSON plan, no explanations.`;

  logger.debug('Planning cross-db query', { dbCount: schemas.size });

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
    maxTokens: 2000,
  });

  const content = response.content;
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from LLM');
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON plan found in response');
  }

  const plan: CrossDbPlan = JSON.parse(jsonMatch[0]);

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
