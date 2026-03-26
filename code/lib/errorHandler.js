/**
 * BunkScanner — Centralized Error Handler
 *
 * Provides structured error classes, middleware for Express,
 * and logging utilities for the entire backend.
 */

'use strict';

/* ══════════════════════════════════════════════════════
   CUSTOM ERROR CLASSES
   ══════════════════════════════════════════════════════ */

class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        timestamp: this.timestamp,
      },
    };
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource, id = null) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, 404, 'NOT_FOUND', { resource, id });
  }
}

class BusError extends AppError {
  constructor(busId, message, details = null) {
    super(message, 502, 'BUS_ERROR', { busId, ...details });
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT');
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

/* ══════════════════════════════════════════════════════
   STRUCTURED LOGGER
   ══════════════════════════════════════════════════════ */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function log(level, category, message, meta = {}) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...(Object.keys(meta).length > 0 && { meta }),
  };

  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${category}]`;

  if (level === 'error') {
    console.error(`${prefix} ${message}`, Object.keys(meta).length > 0 ? meta : '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`, Object.keys(meta).length > 0 ? meta : '');
  } else {
    console.log(`${prefix} ${message}`, Object.keys(meta).length > 0 ? meta : '');
  }

  return entry;
}

const logger = {
  error: (cat, msg, meta) => log('error', cat, msg, meta),
  warn: (cat, msg, meta) => log('warn', cat, msg, meta),
  info: (cat, msg, meta) => log('info', cat, msg, meta),
  debug: (cat, msg, meta) => log('debug', cat, msg, meta),
};

/* ══════════════════════════════════════════════════════
   BUS DATA VALIDATOR
   ══════════════════════════════════════════════════════ */

const VALID_BUSES = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];

function validateBusPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  if (!payload.busId) {
    errors.push('busId is required');
  } else if (typeof payload.busId !== 'string') {
    errors.push('busId must be a string');
  } else if (!VALID_BUSES.includes(payload.busId)) {
    errors.push(`Unknown busId '${payload.busId}'. Valid: ${VALID_BUSES.join(', ')}`);
  }

  if (!payload.nodes) {
    errors.push('nodes array is required');
  } else if (!Array.isArray(payload.nodes)) {
    errors.push('nodes must be an array');
  } else {
    payload.nodes.forEach((node, i) => {
      if (!node.id || typeof node.id !== 'string') {
        errors.push(`nodes[${i}].id is required and must be a string`);
      }
      if (node.avgFill != null && (typeof node.avgFill !== 'number' || node.avgFill < 0 || node.avgFill > 1000)) {
        errors.push(`nodes[${i}].avgFill must be 0–1000 (×10 percentage)`);
      }
      if (node.addr != null && (typeof node.addr !== 'number' || node.addr < 1 || node.addr > 247)) {
        errors.push(`nodes[${i}].addr must be 1–247`);
      }
    });
  }

  if (payload.nodeCount != null && typeof payload.nodeCount !== 'number') {
    errors.push('nodeCount must be a number');
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid bus data payload', errors);
  }
}

/* ══════════════════════════════════════════════════════
   BUS HEALTH MONITOR
   ══════════════════════════════════════════════════════ */

const STALE_THRESHOLD_MS = 60000;       // 60s
const CRITICAL_THRESHOLD_MS = 300000;   // 5 min
const BUS_ERROR_WINDOW_MS = 600000;     // 10 min error tracking window

class BusHealthMonitor {
  constructor() {
    this.errorLog = {};    // busId -> [{timestamp, error}]
    this.lastAlert = {};   // busId -> timestamp of last alert
  }

  recordError(busId, error) {
    if (!this.errorLog[busId]) {
      this.errorLog[busId] = [];
    }
    this.errorLog[busId].push({
      timestamp: Date.now(),
      error: error.message || String(error),
    });
    // Trim old entries
    const cutoff = Date.now() - BUS_ERROR_WINDOW_MS;
    this.errorLog[busId] = this.errorLog[busId].filter(e => e.timestamp > cutoff);
  }

  getErrorRate(busId) {
    const entries = this.errorLog[busId] || [];
    if (entries.length === 0) return 0;
    const windowMs = Date.now() - entries[0].timestamp;
    if (windowMs <= 0) return 0;
    return entries.length / (windowMs / 60000); // errors per minute
  }

  getHealthStatus(busHealth) {
    const now = Date.now();
    const statuses = {};

    for (const [busId, health] of Object.entries(busHealth)) {
      const timeSinceLastSeen = now - health.lastSeen;
      let status = 'healthy';
      let level = 'ok';

      if (timeSinceLastSeen > CRITICAL_THRESHOLD_MS) {
        status = 'critical';
        level = 'error';
      } else if (timeSinceLastSeen > STALE_THRESHOLD_MS) {
        status = 'stale';
        level = 'warn';
      }

      const errorRate = this.getErrorRate(busId);
      if (errorRate > 5) {
        status = 'degraded';
        level = 'warn';
      }

      statuses[busId] = {
        status,
        level,
        lastSeen: health.lastSeen,
        timeSinceLastSeen,
        errorRate: Math.round(errorRate * 100) / 100,
        recentErrors: (this.errorLog[busId] || []).slice(-5),
      };
    }

    // Check for expected buses that never reported
    for (const busId of VALID_BUSES) {
      if (!statuses[busId]) {
        statuses[busId] = {
          status: 'offline',
          level: 'error',
          lastSeen: null,
          timeSinceLastSeen: null,
          errorRate: 0,
          recentErrors: [],
        };
      }
    }

    return statuses;
  }

  reset() {
    this.errorLog = {};
    this.lastAlert = {};
  }
}

/* ══════════════════════════════════════════════════════
   EXPRESS ERROR MIDDLEWARE
   ══════════════════════════════════════════════════════ */

/**
 * Request logger middleware — logs incoming requests.
 */
function requestLogger(req, _res, next) {
  const start = Date.now();
  const originalEnd = _res.end;

  _res.end = function (...args) {
    const duration = Date.now() - start;
    logger.info('HTTP', `${req.method} ${req.path} ${_res.statusCode} ${duration}ms`, {
      method: req.method,
      path: req.path,
      status: _res.statusCode,
      duration,
    });
    originalEnd.apply(this, args);
  };

  next();
}

/**
 * JSON parse error handler — catches malformed JSON bodies.
 */
function jsonParseErrorHandler(err, _req, res, next) {
  if (err.type === 'entity.parse.failed') {
    logger.warn('HTTP', 'Malformed JSON in request body');
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        timestamp: new Date().toISOString(),
      },
    });
  }
  if (err.type === 'entity.too.large') {
    logger.warn('HTTP', 'Request body too large');
    return res.status(413).json(new PayloadTooLargeError().toJSON());
  }
  next(err);
}

/**
 * Global error handler — catches all unhandled errors.
 * Must be registered LAST in the middleware chain.
 */
function globalErrorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    logger.warn('APP', err.message, { code: err.code, details: err.details });
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Unexpected errors — log full stack, return generic message
  logger.error('APP', 'Unhandled error', {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * 404 handler for unknown API routes.
 */
function apiNotFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString(),
      },
    });
  }
  next();
}

/* ══════════════════════════════════════════════════════
   PROCESS-LEVEL ERROR HANDLERS
   ══════════════════════════════════════════════════════ */

function setupProcessHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error('PROCESS', 'Uncaught exception', {
      message: err.message,
      stack: err.stack,
    });
    // Give logger time to flush, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('PROCESS', 'Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('SIGTERM', () => {
    logger.info('PROCESS', 'SIGTERM received — shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('PROCESS', 'SIGINT received — shutting down');
    process.exit(0);
  });
}

/* ══════════════════════════════════════════════════════
   EXPORTS
   ══════════════════════════════════════════════════════ */

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  NotFoundError,
  BusError,
  RateLimitError,
  PayloadTooLargeError,

  // Logger
  logger,

  // Validators
  validateBusPayload,
  VALID_BUSES,

  // Health monitoring
  BusHealthMonitor,
  STALE_THRESHOLD_MS,
  CRITICAL_THRESHOLD_MS,

  // Express middleware
  requestLogger,
  jsonParseErrorHandler,
  globalErrorHandler,
  apiNotFoundHandler,

  // Process handlers
  setupProcessHandlers,
};
