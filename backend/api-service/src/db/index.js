'use strict';

const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'creator_mvp',
  user:     process.env.DB_USER     || 'clipora',
  password: process.env.DB_PASSWORD,
  max:      10,
  idleTimeoutMillis:    30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error(`Unexpected database error: ${err.message}`);
});

/**
 * Run a parameterised query. Returns `{ rows, rowCount }`.
 */
async function query(text, params) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  logger.debug({ query: text, duration: Date.now() - start, rows: res.rowCount });
  return res;
}

/**
 * Grab a client from the pool for transactions.
 * Caller MUST call client.release() in a finally block.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
