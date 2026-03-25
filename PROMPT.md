# sql-mcp — Full Reproduction Prompt

Build a production-grade MCP (Model Context Protocol) server called `sql-mcp` that manages multiple database connections, translates natural language to SQL, executes queries across databases, and renders results with rich visualizations.

---

## Tech Stack

- **Runtime:** Node.js ≥ 18, ES modules (`"type": "module"`)
- **Language:** TypeScript 5.7+ (strict mode, ES2022 target, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.12.1 — server framework (McpServer, StdioServerTransport, StreamableHTTPServerTransport, ResourceTemplate)
- **MCP Apps:** `@modelcontextprotocol/ext-apps` ^1.3.1 — HTML UI extensions for rich clients
- **Validation:** `zod` ^3.24 — tool input schemas
- **DB Drivers:** `pg` ^8.13 (PostgreSQL), `mysql2` ^3.12 (MySQL), `better-sqlite3` ^11.7 (SQLite), `mssql` ^11.0 (SQL Server), `mariadb` ^3.4 (MariaDB). Oracle is optional (dynamic import of `oracledb`).
- **Build:** `tsc` for source, `esbuild` ^0.24 for bundling UI apps into single-file HTML
- **Dev types:** `@types/node`, `@types/pg`, `@types/better-sqlite3`, `@types/mssql`

---

## Project Structure

```
sql-mcp/
├── package.json
├── tsconfig.json
├── esbuild.config.js          # Bundles UI HTML apps (extracts <script type="module">, esbuild bundles, inlines back)
├── sql-mcp.config.example.json
├── src/
│   ├── index.ts                # CLI entry: --stdio (default), --config, --debug, --port
│   ├── server.ts               # Creates McpServer, registers all tools/resources/prompts, auto-connects
│   ├── connections/
│   │   ├── adapters/
│   │   │   ├── base.ts         # DatabaseAdapter interface + ExecuteOptions
│   │   │   ├── postgresql.ts   # pg Pool adapter
│   │   │   ├── mysql.ts        # mysql2 pool adapter
│   │   │   ├── sqlite.ts       # better-sqlite3 sync adapter
│   │   │   ├── mssql.ts        # mssql ConnectionPool adapter
│   │   │   ├── mariadb.ts      # mariadb pool adapter (import * as mariadb)
│   │   │   └── oracle.ts       # Optional, dynamic import via Function('return import("oracledb")')()
│   │   ├── manager.ts          # ConnectionManager: connect/disconnect/tryConnect/reconnect/rename/edit/listConnections
│   │   ├── config.ts           # Loads config from cwd or ~/.sql-mcp/config.json, ${ENV_VAR} interpolation
│   │   ├── persistence.ts      # Atomic read/write to ~/.sql-mcp/connections.json (mode 0600, dir 0700)
│   │   └── schema-introspector.ts  # Schema caching with 5-minute TTL
│   ├── tools/
│   │   ├── connect-database.ts     # Connect with id, name?, env?, type, host, port, db, user, pass, readOnly, ssl
│   │   ├── disconnect-database.ts  # Disconnect by id, removes from persistence
│   │   ├── list-connections.ts     # Shows ALL connections (connected/failed/disconnected) with status icons
│   │   ├── rename-connection.ts    # Set friendly display name
│   │   ├── edit-connection.ts      # Update host/port/db/user/pass/readOnly/ssl, persists, needs reconnect
│   │   ├── reconnect.ts           # Retry a failed/disconnected connection
│   │   ├── execute-query.ts       # SQL execution with security validation, params, 3 output formats
│   │   ├── nl-query.ts           # Natural language → SQL via MCP sampling, optional auto-execute
│   │   ├── cross-db-query.ts     # Multi-DB queries: decompose → parallel execute → merge
│   │   ├── describe-schema.ts    # Schema inspection: summary, detailed tree, or JSON
│   │   ├── visualize-results.ts  # Query + visualization (ASCII table/chart or MCP app)
│   │   ├── explain-query.ts      # Dialect-specific EXPLAIN (PG: ANALYZE+BUFFERS, MySQL: EXPLAIN, SQLite: QUERY PLAN, MSSQL: SHOWPLAN_TEXT)
│   │   └── export-results.ts     # CSV or JSON export with proper escaping
│   ├── security/
│   │   ├── query-validator.ts    # classifyStatement, isDestructive, validateQuery (blocks multi-statement, dangerous patterns, write-on-readonly)
│   │   ├── sandbox.ts           # Clamps timeout ≤5min, rows ≤100k, builds ExecuteOptions from defaults
│   │   └── credential-store.ts  # In-memory credential map, redactConfig strips password/secret/token/key fields
│   ├── sampling/
│   │   ├── nl-to-sql.ts         # Two-pass for 100+ table schemas: select tables → generate SQL. Uses server.server.createMessage()
│   │   └── prompt-builder.ts    # Compact schema context (8KB limit), NL-to-SQL prompts, table selection prompts
│   ├── cross-db/
│   │   ├── planner.ts          # LLM-based query decomposition into per-DB sub-queries + merge strategy
│   │   ├── executor.ts         # Parallel sub-query execution (30s timeout, 10k rows)
│   │   └── merger.ts           # Union (dedup), append (different schemas), hash join (on columns)
│   ├── visualization/
│   │   ├── ascii-table.ts      # Unicode box-drawing table (┌─┬─┐ etc), 40-char column max, footer with stats
│   │   ├── ascii-chart.ts      # Bar chart with ▏▎▍▌▋▊▉█ blocks, 40-width bars, 20-char labels
│   │   └── detect-capabilities.ts  # Checks if MCP client supports text/html;profile=mcp-app
│   ├── elicitation/
│   │   ├── connection-setup.ts     # Interactive form via server.elicitInput for new connections
│   │   ├── query-confirmation.ts   # Confirm destructive operations (DELETE/DROP/etc) via elicitation
│   │   └── db-selector.ts         # Multi-select DB picker for cross-DB queries via elicitation
│   └── utils/
│       ├── types.ts            # All shared interfaces (below)
│       ├── errors.ts           # SqlMcpError base → ConnectionError, QueryError, SecurityError, TimeoutError, ConfigError
│       └── logger.ts           # Structured JSON logging to stderr, configurable level (debug/info/warn/error)
└── ui/
    ├── results-viewer/index.html      # Sortable table + Canvas charts (bar/line/pie/scatter), pagination, search filter
    ├── schema-explorer/index.html     # Collapsible tree, PK/FK/NULL badges, search with highlighting
    └── connection-manager/index.html  # Card grid, status filters, env badges, edit modal, reconnect/disconnect buttons
```

---

## Core Interfaces (`src/utils/types.ts`)

```typescript
type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'oracle' | 'mariadb';
type ConnectionStatus = 'connected' | 'disconnected' | 'failed';
type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER' | 'UNKNOWN';

interface ConnectionConfig {
  type: DatabaseType;
  host?: string; port?: number; database?: string; path?: string;
  user?: string; password?: string; readOnly?: boolean;
  queryTimeout?: number; maxRows?: number; ssl?: boolean | Record<string, unknown>;
}

interface ActiveConnection {
  id: string; name?: string; env?: string;
  config: ConnectionConfig; status: ConnectionStatus; error?: string;
  schema?: SchemaInfo; connectedAt?: Date;
}

interface ConnectionEntry { config: ConnectionConfig; name?: string; env?: string; }
interface ServerConfig { connections: Record<string, ConnectionEntry>; defaults: { readOnly: boolean; queryTimeout: number; maxRows: number; }; }

interface QueryResult { columns: ColumnInfo[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; executionTimeMs: number; statement: string; }
interface ColumnInfo { name: string; type: string; nullable?: boolean; }
interface SchemaInfo { tables: TableInfo[]; connectionId: string; databaseType: DatabaseType; }
interface TableInfo { name: string; schema?: string; columns: ColumnDetail[]; primaryKey?: string[]; foreignKeys: ForeignKey[]; rowCount?: number; }
interface ColumnDetail { name: string; type: string; nullable: boolean; defaultValue?: string; isPrimaryKey: boolean; maxLength?: number; }
interface ForeignKey { column: string; referencesTable: string; referencesColumn: string; }
interface QueryHistoryEntry { connectionId: string; sql: string; statementType: StatementType; rowCount: number; executionTimeMs: number; timestamp: Date; error?: string; }
```

---

## DatabaseAdapter Interface (`src/connections/adapters/base.ts`)

```typescript
interface ExecuteOptions { timeout?: number; maxRows?: number; readOnly?: boolean; }
interface DatabaseAdapter {
  readonly type: string;
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  execute(sql: string, params?: unknown[], options?: ExecuteOptions): Promise<QueryResult>;
  getSchema(): Promise<SchemaInfo>;
  setReadOnly(readOnly: boolean): Promise<void>;
}
```

Each adapter implements this for its specific driver. Key details:
- **PostgreSQL:** Uses `pg.Pool` (max 5). Schema from `information_schema`. Read-only via `SET default_transaction_read_only = true`. Timeout via `SET statement_timeout`.
- **MySQL:** Uses `mysql2.createPool`. Schema from `information_schema`. Read-only via `SET SESSION TRANSACTION READ ONLY`.
- **SQLite:** Uses `better-sqlite3` (sync). Schema from `sqlite_master` + `PRAGMA table_info/foreign_key_list`. WAL mode only on writable DBs. Read-only via `PRAGMA query_only`.
- **MSSQL:** Uses `mssql.ConnectionPool`. Schema from `sys.tables/sys.columns/sys.foreign_keys`. Read-only via `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` + deny write check.
- **MariaDB:** Uses `mariadb.createPool` (`import * as mariadb from 'mariadb'`). Schema from `information_schema`. Similar to MySQL.
- **Oracle:** Dynamic import via `Function('return import("oracledb")')()`. Schema from `user_tables/user_tab_columns/user_constraints/user_cons_columns`. Optional dep.

---

## Connection Persistence (`~/.sql-mcp/`)

- **Directory:** `~/.sql-mcp/` (mode 0700)
- **File:** `~/.sql-mcp/connections.json` (mode 0600)
- **Format:** `Record<string, { config: ConnectionConfig; name?: string; env?: string }>`
- **Atomic writes:** Write to `.tmp`, then `renameSync` to final path
- **Passwords:** Stored in plaintext (like `~/.pgpass`)
- On `connect()`: upsert entry. On `disconnect()`: remove entry. On server shutdown (`disconnectAll`): close adapters but do NOT remove persisted entries (so they restore on restart).
- **Migration:** If old format found (bare ConnectionConfig without wrapper), auto-migrate to new `{ config, name?, env? }` format.

---

## Config File Lookup Order

1. `--config <path>` CLI arg (explicit)
2. `./sql-mcp.config.json` (cwd)
3. `~/.sql-mcp/config.json` (home)
4. `~/.sql-mcp.config.json` (home)

Config supports `name` and `env` metadata inline with each connection entry alongside the standard ConnectionConfig fields. The loader separates metadata from config fields. Passwords support `${ENV_VAR}` interpolation.

---

## ConnectionManager Design

The manager tracks ALL connections — connected, failed, and disconnected:
- `connect(id, config, opts?)` — connects, throws on failure
- `tryConnect(id, config, opts?)` — connects, registers as `failed` on error instead of throwing
- `reconnect(id)` — retries a failed/disconnected connection using stored full config
- `registerConnection(id, config, opts?)` — registers without connecting (for adapters not available etc.)
- `renameConnection(id, name)` — updates display name + persists
- `setConnectionEnv(id, env)` — updates env label + persists
- `editConnection(id, updates)` — partial config update + persists (reconnect needed to apply)
- `disconnect(id, { removePersisted })` — closes adapter; if `removePersisted=false` (shutdown), keeps persistence
- `disconnectAll()` — shutdown: closes all adapters with `removePersisted=false`
- `listConnections()` — returns ALL entries (not just connected ones)

`fullConfigs` map stores configs WITH passwords (never exposed in `meta.config` which strips password).

---

## Server Startup Flow (`server.ts`)

1. `loadConfig(configPath)` — find and parse config file
2. Create `ConnectionManager`, register all 6 adapter factories
3. Create `McpServer` with capabilities: `{ tools: {}, resources: {}, prompts: {} }`
4. Register all 14 tools, 7 resources (4 data + 3 UI apps), 4 prompts
5. `autoConnect(manager, config)`:
   - Load persisted connections from `~/.sql-mcp/connections.json`
   - Merge with config file (config wins on ID conflict)
   - For each: `tryConnect` (registers as failed if unreachable) or `registerConnection` if adapter missing
6. Return `{ server, manager, ready }` where `ready` is the autoConnect promise
7. In `index.ts`: `await ready` BEFORE connecting transport (prevents race condition)

---

## Tools (14 total)

### Connection Management (6)
1. **`connect_database`** — `{ id, name?, env?, type, host?, port?, database?, path?, user?, password?, readOnly?(default:true), ssl? }` → connect + auto-introspect schema
2. **`disconnect_database`** — `{ id }` → close adapter + remove from persistence
3. **`list_connections`** — `{}` → shows ALL connections with status icons (🟢/🔴/⚪), env badges, error messages, table counts, uptime
4. **`rename_connection`** — `{ id, name }` → update display name + persist
5. **`edit_connection`** — `{ id, host?, port?, database?, path?, user?, password?, readOnly?, ssl? }` → partial update + persist (reconnect to apply)
6. **`reconnect`** — `{ id }` → retry connecting a failed/disconnected connection

### Query Execution (3)
7. **`execute_query`** — `{ connectionId, sql, params?, maxRows?, timeout?, format?(table|json|raw) }` → security validation → execute → record in history → format output. Default format is ASCII table with box-drawing.
8. **`nl_query`** — `{ connectionId, question, autoExecute? }` → get schema → build prompt → MCP sampling (createMessage) → extract SQL → validate → optionally execute. Two-pass for schemas with 100+ tables.
9. **`cross_db_query`** — `{ question, connectionIds(min 2), autoExecute? }` → gather schemas → LLM plans sub-queries + merge strategy → parallel execute → merge results (union/append/hash join)

### Schema & Analysis (3)
10. **`describe_schema`** — `{ connectionId, table?, format?(summary|detailed|json) }` → summary: table list with counts. Detailed: tree with types/PK/FK. JSON: raw object.
11. **`explain_query`** — `{ connectionId, sql, analyze? }` → dialect-specific: PG `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`, MySQL `EXPLAIN [ANALYZE]`, SQLite `EXPLAIN QUERY PLAN`, MSSQL `SET SHOWPLAN_TEXT ON`.
12. **`visualize_results`** — `{ connectionId, sql, chartType?(table|bar|auto), labelColumn?, valueColumn?, title? }` → execute → auto-detect best viz (2 cols + ≤30 rows + numeric = bar, else table) → ASCII or MCP app output.

### Export (1)
13. **`export_results`** — `{ connectionId, sql, format(csv|json), maxRows? }` → execute → CSV with proper escaping or formatted JSON.

---

## Resources (7 total)

### Data Resources (4)
1. **`sql://connections`** — JSON array of all connections with id, name, env, status, type, database, host, readOnly, tableCount, connectedAt
2. **`sql://history`** — Last 50 query history entries
3. **`sql://{connId}/schema`** — ResourceTemplate: full schema JSON for a connection. Supports `list` (all connections) and `complete` (connId autocomplete).
4. **`sql://{connId}/tables/{table}`** — ResourceTemplate: detailed table info. Supports `list` (all tables across connections) and `complete` (connId + table name autocomplete).

### MCP App Resources (3)
MIME type: `text/html;profile=mcp-app`

5. **`ui://sql-mcp/results-viewer`** — Interactive results viewer: sortable table (click headers), pagination (50/100/500), search filter, Canvas charts (bar/line/pie/scatter) with column selectors. Dark mode. Uses `@modelcontextprotocol/ext-apps` App + PostMessageTransport.
6. **`ui://sql-mcp/schema-explorer`** — Schema tree: collapsible table nodes, column details with PK (gold) / FK (purple) / NULL (slate) badges, FK relationship display, real-time search with highlighting. Dark mode.
7. **`ui://sql-mcp/connection-manager`** — Card grid: status-colored borders (green/red/gray), badges (type, env, read-only), detail grid (host, db, user, tables), error display, edit modal (name, env, host, port, db, user, pass, readonly), action buttons (Connect/Disconnect). Filters by status/env/search. Stats bar. Calls tools via `app.callTool()`.

UI apps are loaded via `loadUiHtml(name)` which checks: `dist/ui/{name}.html`, then `../dist/ui/{name}.html`, then `../ui/{name}/index.html`.

---

## Prompts (4 total)

1. **`explore-database`** — `{ connectionId }` → Pre-fills schema context, asks to describe structure, show row counts, sample data, suggest queries.
2. **`optimize-query`** — `{ connectionId, sql }` → Asks to run explain, describe tables, suggest optimizations, provide optimized query.
3. **`compare-databases`** — `{ connectionId1, connectionId2 }` → Asks to compare schemas, identify differences, compare column definitions.
4. **`generate-report`** — `{ connectionId, topic }` → Asks to describe schema, run metrics queries, visualize findings, summarize.

---

## Security Pipeline

1. **Query Validation** (`query-validator.ts`):
   - `classifyStatement(sql)` — regex-based classification into StatementType
   - Multi-statement blocking: detects `;` outside quoted strings
   - Dangerous pattern blocking: `INTO OUTFILE`, `LOAD_FILE`, `xp_cmdshell`, `SHUTDOWN`, `LOAD DATA`, `EXEC xp_`, `DBCC`, `OPENROWSET`, `OPENDATASOURCE`
   - Read-only enforcement: blocks INSERT/UPDATE/DELETE/CREATE/DROP/ALTER on read-only connections

2. **Sandbox** (`sandbox.ts`):
   - `MAX_QUERY_TIMEOUT` = 300,000ms (5 min)
   - `MAX_ROW_LIMIT` = 100,000
   - `clampOptions()` — enforces ceilings
   - `buildExecuteOptions(defaults, overrides)` — merges config defaults with per-query overrides

3. **Credential Store** (`credential-store.ts`):
   - In-memory only Map (never serialized)
   - `redactConfig(obj)` — replaces values for keys matching password/secret/token/key/credential with `***`

4. NL-generated SQL goes through the same validation pipeline before execution.

---

## Elicitation Flows (3)

Use `server.elicitInput()` for interactive forms (only works in MCP clients that support elicitation):

1. **Connection Setup** — Form with: connection ID, database type (enum), host, port, database, username, password, read-only toggle. SQLite path detection. Default ports per type.
2. **Query Confirmation** — Boolean confirm for destructive operations (DELETE/DROP/ALTER/etc). Shows SQL in code block.
3. **DB Selector** — Multi-select from active connections for cross-DB queries. Shows connection ID + type + database.

All gracefully fall back if elicitation is not supported (catch error, return null/false).

---

## Sampling (NL-to-SQL)

Uses `server.server.createMessage()` (MCP sampling) to call the host LLM:

1. Build schema context: compact format `table_name: col1(type), col2(type) [FK→ref_table]` with 8KB limit
2. For schemas with 100+ tables: **two-pass approach**
   - Pass 1: Ask LLM to identify relevant tables from full table list
   - Pass 2: Generate SQL using only relevant table schemas
3. For smaller schemas: single-pass SQL generation
4. Extract SQL from response (strip markdown code blocks)
5. Validate through security pipeline

---

## Cross-DB Engine

1. **Planner** (`planner.ts`): LLM decomposes question into JSON plan with sub-queries per DB + merge strategy (union/append/join with columns)
2. **Executor** (`executor.ts`): Runs sub-queries in parallel with `Promise.all`, 30s timeout, 10k row limit
3. **Merger** (`merger.ts`): Merges results by strategy:
   - `union`: concat all rows, dedup by JSON equality
   - `append`: concat rows, merge column sets from different schemas
   - `join`: hash join on specified columns (build hash map from smaller result, probe with larger)

---

## Visualization

- **ASCII Table** (`ascii-table.ts`): Unicode box-drawing (┌┬┐├┼┤└┴┘─│), auto-width (max 40 chars), header row, footer with `{N} rows | {X}ms | truncated` info
- **ASCII Bar Chart** (`ascii-chart.ts`): Labels (max 20 chars) + ▏▎▍▌▋▊▉█ proportional bars (max 40 width) + values. Interface: `{ labels: string[], values: number[], title?: string }`
- **Auto-detection**: If query returns 2 columns, ≤30 rows, and one column is numeric → bar chart. Otherwise → table.
- **MCP App**: If client supports `text/html;profile=mcp-app`, returns JSON `{ data, visualization }` for the UI app to render interactively.

---

## Transports

### Stdio (default)
```
node dist/index.js --stdio --config path/to/config.json --debug
```

### HTTP (Streamable)
```
node dist/index.js --port 3000 --config path/to/config.json
```
- CORS enabled (all origins)
- `GET /health` → `{ status: 'ok', connections: N }`
- `POST /mcp` → StreamableHTTPServerTransport handles MCP protocol
- `OPTIONS` → 204 (preflight)
- Session management via `mcp-session-id` header, `randomUUID()` generator

---

## Graceful Shutdown

- Handles SIGINT and SIGTERM
- Calls `manager.disconnectAll()` which closes all adapters but preserves `~/.sql-mcp/connections.json`
- Then `process.exit(0)`

---

## esbuild UI Bundling

`esbuild.config.js` for each UI app:
1. Read `ui/{name}/index.html`
2. Extract `<script type="module">` content
3. Bundle with esbuild: `bundle: true, format: 'esm', minify: true, target: 'es2022'`, resolve from `@modelcontextprotocol/ext-apps/dist/src`
4. Replace script tag with bundled output
5. Write to `dist/ui/{name}.html`

Scripts: `npm run build` (tsc), `npm run build:ui` (esbuild), `npm run dev` (tsc --watch)

---

## Key Implementation Details

- All MCP tool handlers return `{ content: [{ type: 'text', text: string }] }`
- `server.tool()` signature: `(name, description, zodSchema.shape, handler)`
- `server.resource()` with ResourceTemplate for dynamic URIs with `list` and `complete` callbacks
- `server.prompt()` returns `{ messages: [{ role: 'user', content: { type: 'text', text } }] }`
- McpServer capabilities: `{ tools: {}, resources: {}, prompts: {} }` (no `sampling` — that's client-side)
- Resource descriptions use object form `{ description: '...' }` not string
- `connectedAt` is stored as `Date` but serializes to ISO string in JSON
- Manager meta strips password from config: `{ ...config, password: undefined }`
- Logger writes structured JSON to stderr (not stdout, which is reserved for MCP transport)
