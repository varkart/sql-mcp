import type { SchemaInfo } from '../utils/types.js';
import type { DatabaseAdapter } from './adapters/base.js';
import { logger } from '../utils/logger.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  schema: SchemaInfo;
  timestamp: number;
}

export class SchemaIntrospector {
  private cache = new Map<string, CacheEntry>();

  async getSchema(connectionId: string, adapter: DatabaseAdapter, forceRefresh = false): Promise<SchemaInfo> {
    const cached = this.cache.get(connectionId);

    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug('Schema cache hit', { connectionId });
      return cached.schema;
    }

    logger.debug('Fetching schema', { connectionId });
    const schema = await adapter.getSchema();
    schema.connectionId = connectionId;

    this.cache.set(connectionId, {
      schema,
      timestamp: Date.now(),
    });

    return schema;
  }

  invalidate(connectionId: string): void {
    this.cache.delete(connectionId);
    logger.debug('Schema cache invalidated', { connectionId });
  }

  clear(): void {
    this.cache.clear();
    logger.debug('Schema cache cleared');
  }
}
