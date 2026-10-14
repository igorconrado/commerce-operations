import pg from "pg";
const globalDb = globalThis as unknown as { commercePool?: pg.Pool };
export const pool =
  globalDb.commercePool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
if (process.env.NODE_ENV !== "production") globalDb.commercePool = pool;
export async function transaction<T>(
  run: (client: pg.PoolClient) => Promise<T>,
  existingClient?: pg.PoolClient,
): Promise<T> {
  const client = existingClient ?? (await pool.connect());
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
