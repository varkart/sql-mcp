import type { QueryResult } from '../utils/types.js';

const MAX_COL_WIDTH = 40;

export function renderTable(result: QueryResult): string {
  if (result.rows.length === 0) {
    return `No rows returned | ${result.executionTimeMs}ms`;
  }

  const columnNames = result.columns.map(c => c.name);
  const columnWidths = calculateColumnWidths(columnNames, result.rows);

  const lines: string[] = [];

  lines.push(renderTopBorder(columnWidths));
  lines.push(renderHeaderRow(columnNames, columnWidths));
  lines.push(renderMiddleBorder(columnWidths));

  for (const row of result.rows) {
    lines.push(renderDataRow(columnNames, row, columnWidths));
  }

  lines.push(renderBottomBorder(columnWidths));

  const footer = `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}${
    result.truncated ? ' (truncated)' : ''
  } | ${result.executionTimeMs}ms`;
  lines.push(footer);

  return lines.join('\n');
}

function calculateColumnWidths(columnNames: string[], rows: Record<string, unknown>[]): number[] {
  const widths = columnNames.map(name => Math.min(name.length, MAX_COL_WIDTH));

  for (const row of rows) {
    columnNames.forEach((name, index) => {
      const value = row[name];
      const strValue = formatValue(value);
      widths[index] = Math.max(widths[index], Math.min(strValue.length, MAX_COL_WIDTH));
    });
  }

  return widths;
}

function renderTopBorder(widths: number[]): string {
  const segments = widths.map(w => '─'.repeat(w + 2));
  return '┌' + segments.join('┬') + '┐';
}

function renderMiddleBorder(widths: number[]): string {
  const segments = widths.map(w => '─'.repeat(w + 2));
  return '├' + segments.join('┼') + '┤';
}

function renderBottomBorder(widths: number[]): string {
  const segments = widths.map(w => '─'.repeat(w + 2));
  return '└' + segments.join('┴') + '┘';
}

function renderHeaderRow(columnNames: string[], widths: number[]): string {
  const cells = columnNames.map((name, index) => {
    const truncated = truncateString(name, widths[index]);
    return ' ' + truncated.padEnd(widths[index]) + ' ';
  });
  return '│' + cells.join('│') + '│';
}

function renderDataRow(columnNames: string[], row: Record<string, unknown>, widths: number[]): string {
  const cells = columnNames.map((name, index) => {
    const value = row[name];
    const strValue = formatValue(value);
    const truncated = truncateString(strValue, widths[index]);
    return ' ' + truncated.padEnd(widths[index]) + ' ';
  });
  return '│' + cells.join('│') + '│';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function truncateString(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) {
    return str;
  }
  return str.slice(0, maxWidth - 1) + '…';
}
