export class SqlMcpError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'SqlMcpError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConnectionError extends SqlMcpError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends SqlMcpError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'QueryError';
  }
}

export class SecurityError extends SqlMcpError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'SecurityError';
  }
}

export class TimeoutError extends SqlMcpError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'TimeoutError';
  }
}

export class ConfigError extends SqlMcpError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'ConfigError';
  }
}
