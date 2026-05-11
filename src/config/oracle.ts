import oracledb from 'oracledb';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.autoCommit = false;

let pool: oracledb.Pool | null = null;

export async function initOraclePool(): Promise<oracledb.Pool> {
  if (pool) return pool;
  pool = await oracledb.createPool({
    user: env.ORACLE_USER,
    password: env.ORACLE_PASSWORD,
    connectString: env.ORACLE_CONNECT_STRING,
    poolMin: env.ORACLE_POOL_MIN,
    poolMax: env.ORACLE_POOL_MAX,
    poolIncrement: 1,
  });
  logger.info('Oracle pool бэлэн');
  return pool;
}

export async function closeOraclePool() {
  if (!pool) return;
  await pool.close(10);
  pool = null;
}

export function getPool(): oracledb.Pool {
  if (!pool) throw new Error('Oracle pool init хийгдээгүй байна');
  return pool;
}

export async function withConnection<T>(
  fn: (conn: oracledb.Connection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch (_) {
      // ignore
    }
    throw e;
  } finally {
    await conn.close();
  }
}

export { oracledb };
