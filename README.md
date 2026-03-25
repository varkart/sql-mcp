# sql-mcp

Production-grade MCP (Model Context Protocol) server for managing multiple database connections, translating natural language to SQL, and executing queries across databases with rich visualizations.

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, SQLite, MSSQL, MariaDB, and Oracle
- **Natural Language Queries**: Convert natural language questions to SQL using LLM
- **Cross-Database Queries**: Execute queries across multiple databases with automatic merging
- **Schema Introspection**: Automatic schema discovery with caching
- **Security**: Query validation, sandboxing, and read-only mode
- **Visualization**: ASCII tables and charts for query results
- **Connection Persistence**: Save and restore connections across sessions
- **MCP Tools**: 6+ tools for database management and querying
- **MCP Resources**: Real-time access to connections and query history

## Installation

```bash
npm install
npm run build
```

## Quick Start

1. Copy the example config:
```bash
cp sql-mcp.config.example.json sql-mcp.config.json
```

2. Edit `sql-mcp.config.json` with your database credentials

3. Start the server:
```bash
npm start
# or
node dist/index.js --stdio --config sql-mcp.config.json
```

## Configuration

The server looks for configuration in this order:
1. `--config <path>` CLI argument
2. `./sql-mcp.config.json` (current directory)
3. `~/.sql-mcp/config.json`
4. `~/.sql-mcp.config.json`

### Config Format

```json
{
  "defaults": {
    "readOnly": true,
    "queryTimeout": 30000,
    "maxRows": 1000
  },
  "connections": {
    "db-id": {
      "name": "Friendly Name",
      "env": "production",
      "config": {
        "type": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "mydb",
        "user": "user",
        "password": "${DB_PASSWORD}",
        "readOnly": true,
        "ssl": false
      }
    }
  }
}
```

Environment variables in passwords are supported using `${VAR_NAME}` syntax.

## MCP Tools

### Connection Management
- `connect_database` - Connect to a database
- `disconnect_database` - Disconnect from a database
- `list_connections` - List all connections with status

### Query Execution
- `execute_query` - Execute SQL with validation and formatting
- `nl_query` - Natural language to SQL with optional auto-execute
- `describe_schema` - Inspect database schema

## MCP Resources

- `sql://connections` - JSON list of all connections
- `sql://history` - Last 50 query executions

## MCP Prompts

- `explore-database` - Guided database exploration

## CLI Options

```bash
node dist/index.js [options]

Options:
  --stdio          Use stdio transport (default)
  --config <path>  Path to config file
  --debug          Enable debug logging
  --port <number>  HTTP port (not yet implemented)
```

## Connection Persistence

Connections are persisted to `~/.sql-mcp/connections.json` (mode 0600) for automatic restoration on restart. Passwords are stored in plaintext (similar to `~/.pgpass`).

## Security

- Multi-statement queries are blocked
- Dangerous patterns (LOAD_FILE, xp_cmdshell, etc.) are blocked
- Read-only mode prevents write operations
- Query timeout limits (max 5 minutes)
- Row limits (max 100,000 rows)

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Clean
npm run clean
```

## Database Support

| Database   | Status      | Notes                          |
|------------|-------------|--------------------------------|
| PostgreSQL | ✅ Full     | Tested with v12+               |
| MySQL      | ✅ Full     | Tested with v8.0+              |
| SQLite     | ✅ Full     | Synchronous driver             |
| MSSQL      | ✅ Full     | Tested with SQL Server 2019+   |
| MariaDB    | ✅ Full     | Compatible with MySQL driver   |
| Oracle     | ⚠️  Optional | Requires manual oracledb install|

## Architecture

```
src/
├── connections/
│   ├── adapters/          # Database-specific adapters
│   ├── manager.ts         # Connection lifecycle
│   ├── config.ts          # Config loading
│   ├── persistence.ts     # Connection storage
│   └── schema-introspector.ts
├── security/
│   ├── query-validator.ts # SQL validation
│   ├── sandbox.ts         # Resource limits
│   └── credential-store.ts
├── sampling/
│   ├── nl-to-sql.ts       # Natural language processing
│   └── prompt-builder.ts
├── cross-db/
│   ├── planner.ts         # Query decomposition
│   ├── executor.ts        # Parallel execution
│   └── merger.ts          # Result merging
├── visualization/
│   ├── ascii-table.ts     # Table rendering
│   └── ascii-chart.ts     # Chart rendering
├── server.ts              # MCP server setup
└── index.ts               # CLI entry point
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.
