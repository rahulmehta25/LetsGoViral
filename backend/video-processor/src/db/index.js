'use strict';

const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'creator_mvp',
  user:     process.env.DB_USER     || 'clipora',
  password: process.env.DB_PASSWORD,
  max:      5,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => logger.error(`DB pool error: ${err.message}`));

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query, pool };
