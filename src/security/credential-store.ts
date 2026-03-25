import type { ConnectionConfig } from '../utils/types.js';

const SENSITIVE_KEYS = ['password', 'secret', 'token', 'key', 'credential'];

export function redactConfig(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactConfig);
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk))) {
      redacted[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactConfig(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export class CredentialStore {
  private credentials = new Map<string, ConnectionConfig>();

  set(id: string, config: ConnectionConfig): void {
    this.credentials.set(id, config);
  }

  get(id: string): ConnectionConfig | undefined {
    return this.credentials.get(id);
  }

  delete(id: string): void {
    this.credentials.delete(id);
  }

  clear(): void {
    this.credentials.clear();
  }

  has(id: string): boolean {
    return this.credentials.has(id);
  }
}

export const credentialStore = new CredentialStore();
