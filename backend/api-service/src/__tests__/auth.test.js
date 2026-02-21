'use strict';

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    // Reset module cache so MVP_API_KEY is re-read from env
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.MVP_API_KEY;
    delete process.env.NODE_ENV;
  });

  test('rejects request with no API key when MVP_API_KEY is set', () => {
    process.env.MVP_API_KEY = 'test-key-123';
    const authMiddleware = require('../middleware/auth');

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects request with wrong API key', () => {
    process.env.MVP_API_KEY = 'test-key-123';
    const authMiddleware = require('../middleware/auth');
    req.headers['x-api-key'] = 'wrong-key';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows request with correct API key', () => {
    process.env.MVP_API_KEY = 'test-key-123';
    const authMiddleware = require('../middleware/auth');
    req.headers['x-api-key'] = 'test-key-123';

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('fails open in non-production when MVP_API_KEY is not set', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MVP_API_KEY;
    const authMiddleware = require('../middleware/auth');

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('returns 500 in production when MVP_API_KEY is not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MVP_API_KEY;
    const authMiddleware = require('../middleware/auth');

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'API key not configured' });
    expect(next).not.toHaveBeenCalled();
  });
});
