import type { StatementType } from '../utils/types.js';
import { SecurityError } from '../utils/errors.js';

const DANGEROUS_PATTERNS = [
  /INTO\s+OUTFILE/i,
  /LOAD_FILE/i,
  /xp_cmdshell/i,
  /SHUTDOWN/i,
  /LOAD\s+DATA/i,
  /EXEC\s+xp_/i,
  /DBCC/i,
  /OPENROWSET/i,
  /OPENDATASOURCE/i,
];

const WRITE_STATEMENTS: StatementType[] = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];

export function classifyStatement(sql: string): StatementType {
  const trimmed = sql.trim().toUpperCase();

  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('DROP')) return 'DROP';
  if (trimmed.startsWith('ALTER')) return 'ALTER';

  return 'UNKNOWN';
}

export function isDestructive(statementType: StatementType): boolean {
  return ['DELETE', 'DROP', 'ALTER'].includes(statementType);
}

export function validateQuery(sql: string, readOnly: boolean): void {
  if (hasMultipleStatements(sql)) {
    throw new SecurityError('Multiple statements are not allowed');
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      throw new SecurityError(`Dangerous pattern detected: ${pattern.source}`);
    }
  }

  const statementType = classifyStatement(sql);

  if (readOnly && WRITE_STATEMENTS.includes(statementType)) {
    throw new SecurityError(`Write operations are not allowed on read-only connections: ${statementType}`);
  }
}

function hasMultipleStatements(sql: string): boolean {
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inString) {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === stringChar && inString) {
      inString = false;
      stringChar = '';
      continue;
    }

    if (char === ';' && !inString) {
      const afterSemi = sql.slice(i + 1).trim();
      if (afterSemi.length > 0) {
        return true;
      }
    }
  }

  return false;
}

export function extractSqlFromMarkdown(text: string): string {
  const codeBlockMatch = text.match(/```(?:sql)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const inlineMatch = text.match(/`([^`]+)`/);
  if (inlineMatch) {
    return inlineMatch[1].trim();
  }

  return text.trim();
}
