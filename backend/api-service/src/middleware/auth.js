'use strict';

/**
 * MVP API-key middleware.
 * Store the key in Google Secret Manager; inject via Cloud Run env var MVP_API_KEY.
 * All /api/* routes pass through this before reaching any handler.
 */
const MVP_API_KEY = process.env.MVP_API_KEY;

function authMiddleware(req, res, next) {
  if (!MVP_API_KEY) {
    // Fail open only during local dev if the env var is missing.
    // In production the container will always have it via Secret Manager.
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(500).json({ error: 'API key not configured' });
  }

  const key = req.headers['x-api-key'];
  if (!key || key !== MVP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = authMiddleware;
