'use strict';

require('dotenv').config();
require('express-async-errors');

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const { logger } = require('./utils/logger');

const authMiddleware  = require('./middleware/auth');
const projectsRouter  = require('./routes/projects');
const scriptsRouter   = require('./routes/scripts');
const videosRouter    = require('./routes/videos');
const clipsRouter     = require('./routes/clips');

const app  = express();
const PORT = process.env.PORT || 8080;

// ─── Security & Parsing ────────────────────────────────────────────────────
app.use(helmet());
const CORS_ORIGINS = process.env.CORS_ORIGINS;
app.use(cors(CORS_ORIGINS ? { origin: CORS_ORIGINS.split(',') } : {}));
app.use(express.json({ limit: '1mb' })); // No large bodies — videos go direct to GCS
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// ─── Health Check (unauthenticated) ───────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'clipora-api' }));

// ─── API Routes (all protected by API key) ────────────────────────────────
app.use('/api', authMiddleware);
app.use('/api/projects', projectsRouter);
app.use('/api/scripts',  scriptsRouter);
app.use('/api/videos',   videosRouter);
app.use('/api/clips',    clipsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Global Error Handler ─────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ message: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── DB Migrations (idempotent) ──────────────────────────────────────────
const db = require('./db');
(async () => {
  try {
    await db.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS music_data JSONB DEFAULT NULL`);
    logger.info('DB migration: music_data column ensured');
  } catch (err) {
    logger.warn(`DB migration skipped: ${err.message}`);
  }
})();

// ─── Start Server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Clipora API listening on port ${PORT}`);
});

module.exports = app; // For testing
