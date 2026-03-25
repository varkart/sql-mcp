import type { DatabaseAdapter } from '../connections/adapters/base.js';
import type { QueryResult, SubQuery } from '../utils/types.js';
import { TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const CROSS_DB_TIMEOUT = 30000;
const CROSS_DB_MAX_ROWS = 10000;

export async function executeSubQueries(
  subQueries: SubQuery[],
  adapters: Map<string, DatabaseAdapter>
): Promise<Map<string, QueryResult>> {
  const results = new Map<string, QueryResult>();

  const promises = subQueries.map(async sq => {
    const adapter = adapters.get(sq.connectionId);
    if (!adapter) {
      throw new Error(`Adapter not found for connection: ${sq.connectionId}`);
    }

    logger.debug('Executing sub-query', { connectionId: sq.connectionId, sql: sq.sql });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError('Sub-query timeout')), CROSS_DB_TIMEOUT);
    });

    const queryPromise = adapter.execute(sq.sql, [], {
      timeout: CROSS_DB_TIMEOUT,
      maxRows: CROSS_DB_MAX_ROWS,
    });

    const result = await Promise.race([queryPromise, timeoutPromise]);

    results.set(sq.connectionId, result);

    logger.debug('Sub-query completed', {
      connectionId: sq.connectionId,
      rowCount: result.rowCount,
    });

    return result;
  });

  await Promise.all(promises);

  return results;
}
