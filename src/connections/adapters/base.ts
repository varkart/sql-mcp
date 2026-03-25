import type { ConnectionConfig, QueryResult, SchemaInfo, ExecuteOptions } from '../../utils/types.js';

export interface DatabaseAdapter {
  readonly type: string;
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  execute(sql: string, params?: unknown[], options?: ExecuteOptions): Promise<QueryResult>;
  getSchema(): Promise<SchemaInfo>;
  setReadOnly(readOnly: boolean): Promise<void>;
}
