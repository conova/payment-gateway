// Notification-gateway-тай ижил migration runner.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runStatement(conn: oracledb.Connection, sql: string) {
  const cleaned = sql.trim().replace(/;\s*$/, '');
  if (!cleaned) return;
  try {
    await conn.execute(cleaned);
  } catch (e: unknown) {
    const err = e as { errorNum?: number; message?: string };
    if (err.errorNum === 955 || err.errorNum === 2275) {
      logger.warn({ errorNum: err.errorNum }, 'skip already-exists');
      return;
    }
    throw e;
  }
}

async function splitStatements(sql: string): Promise<string[]> {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function main() {
  logger.info('Migration эхэллээ');
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  logger.info({ count: files.length }, 'Migration файл олдсон');

  const conn = await oracledb.getConnection({
    user: env.ORACLE_USER,
    password: env.ORACLE_PASSWORD,
    connectString: env.ORACLE_CONNECT_STRING,
  });

  try {
    for (const file of files) {
      logger.info({ file }, 'Migration ажиллуулж байна');
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const statements = await splitStatements(sql);
      for (const stmt of statements) {
        await runStatement(conn, stmt);
      }
      await conn.commit();
      logger.info({ file }, 'OK');
    }
    logger.info('Бүх migration амжилттай');
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  logger.error({ err: e }, 'Migration алдаа');
  process.exit(1);
});
