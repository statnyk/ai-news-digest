import pg from "pg";
import config from "../config/index.js";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool(config.db);
  }
  return pool;
}

/**
 * Run a query against the database.
 * @param {string} text — SQL query
 * @param {any[]} params — parameterized values
 */
export async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Gracefully close the pool.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
