/**
 * Migration runner
 * ────────────────
 * Applies every .sql file in ../migrations in filename order, exactly once,
 * inside a transaction, and records what ran in a schema_migrations table.
 *
 *   npm run migrate          apply anything outstanding
 *   npm run migrate:status   show what has and has not been applied
 *
 * The previous setup only ever ran 001_initial_schema.sql by hand, so the
 * columns added by 002 and the tables added by 003 were missing in any database
 * set up with setup-database.bat — payments and bills failed at runtime.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { pool, withTransaction } from './db'

dotenv.config()

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations')

interface AppliedRow {
  filename:   string
  checksum:   string
  applied_at: string
}

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      checksum   TEXT        NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

function migrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()   // 001_, 002_, … — the numeric prefix defines the order
}

function checksum(contents: string): string {
  // Normalise line endings so a file checked out on Windows and on Linux
  // hashes identically.
  return crypto.createHash('sha256')
    .update(contents.replace(/\r\n/g, '\n'))
    .digest('hex')
    .slice(0, 16)
}

async function applied(): Promise<Map<string, AppliedRow>> {
  const { rows } = await pool.query<AppliedRow>(
    `SELECT filename, checksum, applied_at FROM schema_migrations`
  )
  return new Map(rows.map(r => [r.filename, r]))
}

async function status(): Promise<void> {
  await ensureTable()
  const done  = await applied()
  const files = migrationFiles()

  if (files.length === 0) {
    console.log('No migration files found in', MIGRATIONS_DIR)
    return
  }

  console.log('\nMigration status:\n')
  for (const file of files) {
    const record = done.get(file)
    if (!record) {
      console.log(`  [ PENDING ]  ${file}`)
      continue
    }
    const current = checksum(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    const changed = current !== record.checksum ? '  ⚠️  file changed since it was applied' : ''
    console.log(`  [ applied ]  ${file}   ${new Date(record.applied_at).toISOString().slice(0, 19)}${changed}`)
  }
  console.log('')
}

async function migrate(): Promise<void> {
  await ensureTable()
  const done  = await applied()
  const files = migrationFiles()

  if (files.length === 0) {
    console.log('No migration files found in', MIGRATIONS_DIR)
    return
  }

  let ran = 0

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file)
    const sql      = fs.readFileSync(fullPath, 'utf8')
    const sum      = checksum(sql)
    const record   = done.get(file)

    if (record) {
      if (record.checksum !== sum) {
        // Editing an applied migration means two databases can silently drift
        // apart — warn loudly rather than re-running and hoping it is idempotent.
        console.warn(
          `⚠️  ${file} has changed since it was applied. ` +
          'Add a new migration instead of editing an applied one.'
        )
      }
      continue
    }

    process.stdout.write(`Applying ${file} … `)
    try {
      // One transaction per file: a failure leaves the database untouched
      // rather than half-migrated.
      await withTransaction(async (client) => {
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
          [file, sum]
        )
      })
      console.log('done')
      ran++
    } catch (err) {
      console.log('FAILED')
      console.error(`\n❌ ${file} failed — no changes from this file were applied.\n`)
      console.error((err as Error).message)
      throw err
    }
  }

  console.log(
    ran === 0
      ? '\n✅ Database is already up to date.\n'
      : `\n✅ Applied ${ran} migration${ran === 1 ? '' : 's'}.\n`
  )
}

/**
 * Record migrations as applied WITHOUT running their SQL.
 *
 * For a database that was set up by hand before this runner existed: the
 * tables are already there, but schema_migrations is empty, so a plain
 * `migrate` would replay files against live data. Baseline the files that are
 * already in place, then let `migrate` apply only what is genuinely new.
 *
 *   npm run migrate -- baseline 001_initial_schema.sql 002_reducing_balance.sql
 *   npm run migrate -- baseline --through 003_bills.sql
 */
async function baseline(args: string[]): Promise<void> {
  await ensureTable()
  const files = migrationFiles()

  let targets: string[]

  if (args[0] === '--through') {
    const through = args[1]
    if (!through || !files.includes(through)) {
      throw new Error(`--through needs a migration filename. Available: ${files.join(', ')}`)
    }
    targets = files.slice(0, files.indexOf(through) + 1)
  } else if (args.length > 0) {
    const unknown = args.filter(a => !files.includes(a))
    if (unknown.length > 0) throw new Error(`Unknown migration file(s): ${unknown.join(', ')}`)
    targets = args
  } else {
    throw new Error('Specify migration filenames, or --through <filename>.')
  }

  const done = await applied()
  let marked = 0

  for (const file of targets) {
    if (done.has(file)) {
      console.log(`  already recorded: ${file}`)
      continue
    }
    const sum = checksum(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    await pool.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [file, sum]
    )
    console.log(`  baselined (not executed): ${file}`)
    marked++
  }

  console.log(`\n✅ Recorded ${marked} migration${marked === 1 ? '' : 's'} as already applied.`)
  console.log('   Run "npm run migrate" to apply anything still outstanding.\n')
}

async function main() {
  const command = process.argv[2] || 'up'
  try {
    if      (command === 'status')   await status()
    else if (command === 'baseline') await baseline(process.argv.slice(3))
    else                             await migrate()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('\nMigration run aborted:', (err as Error).message)
    await pool.end().catch(() => undefined)
    process.exit(1)
  }
}

main()
