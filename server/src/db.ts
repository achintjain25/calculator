import { Pool, PoolClient, types } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// ─── Type parsers ─────────────────────────────────────────────────────────────
// By default node-postgres converts DATE (OID 1082) into a JS Date at the
// server's local midnight, which shifts the calendar day for anyone east or
// west of UTC — a loan starting 2026-06-02 reads back as 2026-06-01 in IST.
// Every date in this app is a plain calendar date, so keep them as YYYY-MM-DD
// strings and let the interest engine do the arithmetic.
const DATE_OID       = 1082
const DATE_ARRAY_OID = 1182

types.setTypeParser(DATE_OID, (value: string) => value)

// @types/pg only enumerates the OIDs it ships helpers for, so 1182 has to be
// asserted through. The OID itself is stable in every PostgreSQL release.
const setParser = types.setTypeParser as unknown as
  (oid: number, parseFn: (value: string) => unknown) => void

// DATE[] is parsed by a SEPARATE routine that does not consult the scalar
// parser above, so an ARRAY_AGG(payment_date) still came back as shifted Date
// objects. The dashboard aggregates payments that way, so it has to be
// overridden too or the two code paths disagree by a day.
setParser(DATE_ARRAY_OID, (value: string) => {
  // Postgres array literal: {2026-06-02,2026-07-23} — or NULL for no rows.
  if (!value || value === '{}') return []
  return value
    .slice(1, -1)
    .split(',')
    .map(v => v.replace(/^"|"$/g, ''))
    .filter(v => v !== 'NULL')
})

const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * SSL is required by most managed PostgreSQL providers and is a no-op for a
 * local install. DB_SSL=true turns it on; DB_SSL_REJECT_UNAUTHORIZED=false
 * additionally allows a self-signed server certificate.
 */
function sslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  }
}

// A single shared pool, reused across all requests.
export const pool = new Pool({
  // A full connection string wins when present (managed providers hand one out).
  connectionString: process.env.DATABASE_URL || undefined,
  host:     process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
  port:     process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME || 'rj_jewellers'),
  user:     process.env.DATABASE_URL ? undefined : (process.env.DB_USER || 'postgres'),
  password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || ''),
  ssl:      sslConfig(),

  max:                     parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
  // Stop one wedged query from holding a pooled connection forever.
  statement_timeout:                15_000,
  idle_in_transaction_session_timeout: 15_000,
})

// An idle client erroring (network blip, DB restart) must not crash the process.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message)
})

/** Run a single query with parameterised values. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const started = Date.now()
  try {
    const res = await pool.query(text, params)
    return res.rows as T[]
  } finally {
    const ms = Date.now() - started
    // Surface queries slow enough to hurt, without logging every request.
    if (ms > 1_000) {
      console.warn(`Slow query (${ms}ms): ${text.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
    }
  }
}

/** Run multiple statements in a single transaction. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    // A failed ROLLBACK must not mask the original error that caused it.
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      console.error('ROLLBACK failed:', rollbackErr)
    }
    throw err
  } finally {
    client.release()
  }
}

/** Test connectivity — used at startup, retried so a slow DB does not abort boot. */
export async function testConnection(retries = 5, delayMs = 2_000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        console.log('✅ PostgreSQL connected successfully')
        return
      } finally {
        client.release()
      }
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(
        `PostgreSQL not ready (attempt ${attempt}/${retries}): ${(err as Error).message} — retrying in ${delayMs}ms`
      )
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export { IS_PROD }
