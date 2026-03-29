import pg from "pg";

const { Pool } = pg;

// Reuse SSL-stripping pattern from remix/app/db/index.ts
// node-postgres ignores ssl config if sslmode is in the connection string
const rawDatabaseUrl = process.env.CYNCO_DATABASE_URL || "";
const requiresSsl = rawDatabaseUrl.includes("sslmode=require");
const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=[^&]*/g, "");

const statementTimeout = parseInt(process.env.MCP_DB_STATEMENT_TIMEOUT || "30000", 10) || 30000;

// pg-pool's onConnect is awaited before handing the client to callers, unlike
// the EventEmitter "connect" event which fires-and-forgets. @types/pg doesn't
// include onConnect yet, so we cast.
type PoolConfigWithOnConnect = pg.PoolConfig & {
  onConnect?: (client: pg.PoolClient) => Promise<void>;
};

const pool = new Pool({
  connectionString: databaseUrl,
  max: parseInt(process.env.MCP_DB_POOL_MAX || "5", 10),
  idleTimeoutMillis: parseInt(process.env.MCP_DB_POOL_IDLE_TIMEOUT || "30000", 10),
  connectionTimeoutMillis: parseInt(process.env.MCP_DB_CONN_TIMEOUT || "10000", 10),
  // query_timeout is client-side (node-postgres), safe with PgBouncer transaction pooling.
  // statement_timeout as a connection parameter is rejected by PgBouncer.
  query_timeout: statementTimeout,
  // Set server-side statement_timeout on each new connection via PgBouncer-safe SET command.
  onConnect: async (client: pg.PoolClient) => {
    await client.query("SELECT set_config('statement_timeout', $1::text, false)", [statementTimeout]);
  },
  ssl: requiresSsl
    ? { rejectUnauthorized: false }
    : undefined,
} as PoolConfigWithOnConnect);

pool.on("error", (err) => {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    msg: "DB pool idle client error",
    error: err.message,
  }) + "\n");
});

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export function getPoolStats(): PoolStats {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export async function healthCheck(): Promise<void> {
  const result = await pool.query("SELECT 1 AS ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Database health check failed.");
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}
