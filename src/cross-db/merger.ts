import type { QueryResult, MergeStrategy, ColumnInfo } from '../utils/types.js';
import { logger } from '../utils/logger.js';

export function mergeResults(
  results: Map<string, QueryResult>,
  strategy: MergeStrategy
): QueryResult {
  const resultArray = Array.from(results.values());

  if (resultArray.length === 0) {
    throw new Error('No results to merge');
  }

  if (resultArray.length === 1) {
    return resultArray[0];
  }

  logger.debug('Merging results', { strategy: strategy.type, resultCount: resultArray.length });

  switch (strategy.type) {
    case 'union':
      return mergeUnion(resultArray);
    case 'append':
      return mergeAppend(resultArray);
    case 'join':
      if (!strategy.joinColumns || strategy.joinColumns.length === 0) {
        throw new Error('Join columns required for join merge strategy');
      }
      return mergeJoin(resultArray, strategy.joinColumns);
    default:
      throw new Error(`Unknown merge strategy: ${strategy.type}`);
  }
}

function mergeUnion(results: QueryResult[]): QueryResult {
  const first = results[0];
  const allRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const row of result.rows) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        allRows.push(row);
      }
    }
  }

  return {
    columns: first.columns,
    rows: allRows,
    rowCount: allRows.length,
    truncated: results.some(r => r.truncated),
    executionTimeMs: Math.max(...results.map(r => r.executionTimeMs)),
    statement: 'UNION',
  };
}

function mergeAppend(results: QueryResult[]): QueryResult {
  const allColumns = new Map<string, ColumnInfo>();

  for (const result of results) {
    for (const col of result.columns) {
      if (!allColumns.has(col.name)) {
        allColumns.set(col.name, col);
      }
    }
  }

  const columns = Array.from(allColumns.values());
  const allRows: Record<string, unknown>[] = [];

  for (const result of results) {
    allRows.push(...result.rows);
  }

  return {
    columns,
    rows: allRows,
    rowCount: allRows.length,
    truncated: results.some(r => r.truncated),
    executionTimeMs: Math.max(...results.map(r => r.executionTimeMs)),
    statement: 'APPEND',
  };
}

function mergeJoin(results: QueryResult[], joinColumns: string[]): QueryResult {
  if (results.length !== 2) {
    throw new Error('Join merge currently supports exactly 2 result sets');
  }

  const [left, right] = results;

  const hashMap = new Map<string, Record<string, unknown>>();
  for (const row of left.rows) {
    const key = joinColumns.map(col => row[col]).join('|');
    hashMap.set(key, row);
  }

  const joinedRows: Record<string, unknown>[] = [];

  for (const rightRow of right.rows) {
    const key = joinColumns.map(col => rightRow[col]).join('|');
    const leftRow = hashMap.get(key);

    if (leftRow) {
      const joined = { ...leftRow, ...rightRow };
      joinedRows.push(joined);
    }
  }

  const allColumns = new Map<string, ColumnInfo>();
  for (const col of left.columns) {
    allColumns.set(col.name, col);
  }
  for (const col of right.columns) {
    if (!allColumns.has(col.name)) {
      allColumns.set(col.name, col);
    }
  }

  return {
    columns: Array.from(allColumns.values()),
    rows: joinedRows,
    rowCount: joinedRows.length,
    truncated: left.truncated || right.truncated,
    executionTimeMs: Math.max(left.executionTimeMs, right.executionTimeMs),
    statement: 'JOIN',
  };
}
