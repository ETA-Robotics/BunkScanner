/**
 * BunkScanner — Error Handler Tests
 *
 * Tests the error classes, validators, health monitor, and middleware.
 */

const {
  AppError,
  ValidationError,
  NotFoundError,
  BusError,
  RateLimitError,
  PayloadTooLargeError,
  validateBusPayload,
  BusHealthMonitor,
  VALID_BUSES,
  STALE_THRESHOLD_MS,
  CRITICAL_THRESHOLD_MS,
  logger,
  requestLogger,
  jsonParseErrorHandler,
  globalErrorHandler,
  apiNotFoundHandler,
  setupProcessHandlers,
} = require('../lib/errorHandler');

/* ══════════════════════════════════════════════════════
   ERROR CLASSES
   ══════════════════════════════════════════════════════ */

describe('Error Classes', () => {
  describe('AppError', () => {
    test('creates error with correct properties', () => {
      const err = new AppError('test error', 500, 'TEST_CODE', { foo: 'bar' });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.message).toBe('test error');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('TEST_CODE');
      expect(err.details).toEqual({ foo: 'bar' });
      expect(err.timestamp).toBeDefined();
      expect(err.name).toBe('AppError');
    });

    test('toJSON returns structured error', () => {
      const err = new AppError('msg', 400, 'CODE', { detail: 1 });
      const json = err.toJSON();
      expect(json.error.code).toBe('CODE');
      expect(json.error.message).toBe('msg');
      expect(json.error.details).toEqual({ detail: 1 });
      expect(json.error.timestamp).toBeDefined();
    });

    test('toJSON omits details when null', () => {
      const err = new AppError('msg', 400, 'CODE');
      const json = err.toJSON();
      expect(json.error.details).toBeUndefined();
    });

    test('has stack trace', () => {
      const err = new AppError('msg', 500, 'CODE');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    test('has 400 status code', () => {
      const err = new ValidationError('bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err).toBeInstanceOf(AppError);
    });

    test('includes detail array', () => {
      const details = ['field1 required', 'field2 invalid'];
      const err = new ValidationError('invalid', details);
      expect(err.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    test('creates message with resource and id', () => {
      const err = new NotFoundError('Bus', 'BUS-X');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("Bus 'BUS-X' not found");
    });

    test('creates message without id', () => {
      const err = new NotFoundError('Data');
      expect(err.message).toBe('Data not found');
    });
  });

  describe('BusError', () => {
    test('has 502 status code with bus details', () => {
      const err = new BusError('BUS-D', 'Communication timeout');
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe('BUS_ERROR');
      expect(err.details.busId).toBe('BUS-D');
    });
  });

  describe('RateLimitError', () => {
    test('has 429 status code', () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMIT');
    });
  });

  describe('PayloadTooLargeError', () => {
    test('has 413 status code', () => {
      const err = new PayloadTooLargeError();
      expect(err.statusCode).toBe(413);
    });
  });
});

/* ══════════════════════════════════════════════════════
   PAYLOAD VALIDATION
   ══════════════════════════════════════════════════════ */

describe('validateBusPayload', () => {
  const validPayload = {
    busId: 'BUS-D',
    nodes: [
      { id: 'D01-S01', addr: 1, avgFill: 500, cam1Fill: 480, cam2Fill: 520, cam3Fill: 490, cam4Fill: 510, status: 15, variance: 40, confidence: 80 },
    ],
    nodeCount: 1,
  };

  test('accepts valid payload', () => {
    expect(() => validateBusPayload(validPayload)).not.toThrow();
  });

  test('accepts payload with empty nodes', () => {
    expect(() => validateBusPayload({ busId: 'BUS-D', nodes: [] })).not.toThrow();
  });

  test('rejects null payload', () => {
    expect(() => validateBusPayload(null)).toThrow(ValidationError);
  });

  test('rejects non-object payload', () => {
    expect(() => validateBusPayload('string')).toThrow(ValidationError);
  });

  test('rejects missing busId', () => {
    expect(() => validateBusPayload({ nodes: [] })).toThrow(ValidationError);
    try {
      validateBusPayload({ nodes: [] });
    } catch (err) {
      expect(err.details).toContain('busId is required');
    }
  });

  test('rejects non-string busId', () => {
    expect(() => validateBusPayload({ busId: 123, nodes: [] })).toThrow(ValidationError);
  });

  test('rejects unknown busId', () => {
    expect(() => validateBusPayload({ busId: 'BUS-X', nodes: [] })).toThrow(ValidationError);
    try {
      validateBusPayload({ busId: 'BUS-X', nodes: [] });
    } catch (err) {
      expect(err.details[0]).toContain('Unknown busId');
    }
  });

  test('rejects missing nodes', () => {
    expect(() => validateBusPayload({ busId: 'BUS-D' })).toThrow(ValidationError);
  });

  test('rejects non-array nodes', () => {
    expect(() => validateBusPayload({ busId: 'BUS-D', nodes: 'not-array' })).toThrow(ValidationError);
  });

  test('rejects node with missing id', () => {
    expect(() => validateBusPayload({
      busId: 'BUS-D',
      nodes: [{ addr: 1 }],
    })).toThrow(ValidationError);
  });

  test('rejects node with out-of-range avgFill', () => {
    expect(() => validateBusPayload({
      busId: 'BUS-D',
      nodes: [{ id: 'D01-S01', avgFill: 1500 }],
    })).toThrow(ValidationError);
  });

  test('rejects node with negative avgFill', () => {
    expect(() => validateBusPayload({
      busId: 'BUS-D',
      nodes: [{ id: 'D01-S01', avgFill: -10 }],
    })).toThrow(ValidationError);
  });

  test('rejects node with out-of-range addr', () => {
    expect(() => validateBusPayload({
      busId: 'BUS-D',
      nodes: [{ id: 'D01-S01', addr: 300 }],
    })).toThrow(ValidationError);
  });

  test('rejects non-number nodeCount', () => {
    expect(() => validateBusPayload({
      busId: 'BUS-D',
      nodes: [],
      nodeCount: 'five',
    })).toThrow(ValidationError);
  });

  test('all valid buses are accepted', () => {
    for (const busId of VALID_BUSES) {
      expect(() => validateBusPayload({ busId, nodes: [] })).not.toThrow();
    }
  });

  test('collects multiple errors', () => {
    try {
      validateBusPayload({
        busId: 'BUS-D',
        nodes: [
          { addr: 300 },           // missing id + bad addr
          { id: 'X', avgFill: -1 } // bad avgFill
        ],
      });
    } catch (err) {
      expect(err.details.length).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ══════════════════════════════════════════════════════
   BUS HEALTH MONITOR
   ══════════════════════════════════════════════════════ */

describe('BusHealthMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new BusHealthMonitor();
  });

  test('records and retrieves errors', () => {
    monitor.recordError('BUS-D', new Error('timeout'));
    monitor.recordError('BUS-D', new Error('CRC fail'));
    expect(monitor.errorLog['BUS-D']).toHaveLength(2);
  });

  test('trims old error entries', () => {
    // Manually add old entries
    monitor.errorLog['BUS-D'] = [
      { timestamp: Date.now() - 700000, error: 'old error' },
      { timestamp: Date.now() - 100, error: 'recent error' },
    ];
    monitor.recordError('BUS-D', new Error('new'));
    // Old entry (>600s) should be trimmed
    expect(monitor.errorLog['BUS-D']).toHaveLength(2);
  });

  test('calculates error rate', () => {
    // Spread errors over time so the window is non-zero
    const now = Date.now();
    monitor.errorLog['BUS-D'] = [
      { timestamp: now - 60000, error: 'e1' },
      { timestamp: now - 30000, error: 'e2' },
      { timestamp: now - 100,   error: 'e3' },
    ];
    const rate = monitor.getErrorRate('BUS-D');
    expect(rate).toBeGreaterThan(0);
  });

  test('returns 0 error rate for unknown bus', () => {
    expect(monitor.getErrorRate('BUS-X')).toBe(0);
  });

  test('reports healthy status for recent data', () => {
    const busHealth = {
      'BUS-D': { lastSeen: Date.now(), nodeCount: 10, online: true },
    };
    const statuses = monitor.getHealthStatus(busHealth);
    expect(statuses['BUS-D'].status).toBe('healthy');
    expect(statuses['BUS-D'].level).toBe('ok');
  });

  test('reports stale status after threshold', () => {
    const busHealth = {
      'BUS-D': { lastSeen: Date.now() - STALE_THRESHOLD_MS - 1000, nodeCount: 10, online: true },
    };
    const statuses = monitor.getHealthStatus(busHealth);
    expect(statuses['BUS-D'].status).toBe('stale');
    expect(statuses['BUS-D'].level).toBe('warn');
  });

  test('reports critical status after critical threshold', () => {
    const busHealth = {
      'BUS-D': { lastSeen: Date.now() - CRITICAL_THRESHOLD_MS - 1000, nodeCount: 10, online: true },
    };
    const statuses = monitor.getHealthStatus(busHealth);
    expect(statuses['BUS-D'].status).toBe('critical');
    expect(statuses['BUS-D'].level).toBe('error');
  });

  test('reports offline for missing buses', () => {
    const statuses = monitor.getHealthStatus({});
    for (const busId of VALID_BUSES) {
      expect(statuses[busId].status).toBe('offline');
      expect(statuses[busId].level).toBe('error');
    }
  });

  test('includes all 7 expected buses', () => {
    const statuses = monitor.getHealthStatus({});
    expect(Object.keys(statuses)).toHaveLength(7);
  });

  test('reset clears all data', () => {
    monitor.recordError('BUS-D', new Error('test'));
    monitor.reset();
    expect(monitor.errorLog).toEqual({});
    expect(monitor.lastAlert).toEqual({});
  });
});

/* ══════════════════════════════════════════════════════
   LOGGER
   ══════════════════════════════════════════════════════ */

describe('Logger', () => {
  test('logger has all level methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('info returns structured entry', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const entry = logger.info('TEST', 'hello', { key: 'val' });
    expect(entry.level).toBe('info');
    expect(entry.category).toBe('TEST');
    expect(entry.message).toBe('hello');
    spy.mockRestore();
  });

  test('error uses console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    logger.error('TEST', 'fail');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('warn uses console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    logger.warn('TEST', 'warning');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('debug returns undefined when log level is info (default)', () => {
    // Default LOG_LEVEL is 'info', so debug messages are filtered out
    const spy = jest.spyOn(console, 'debug').mockImplementation();
    const entry = logger.debug('TEST', 'debug msg', { detail: 1 });
    expect(entry).toBeUndefined();
    spy.mockRestore();
  });
});

/* ══════════════════════════════════════════════════════
   HEALTH MONITOR — DEGRADED STATUS
   ══════════════════════════════════════════════════════ */

describe('BusHealthMonitor degraded status', () => {
  let monitor;

  beforeEach(() => {
    monitor = new BusHealthMonitor();
  });

  test('reports degraded when error rate > 5', () => {
    // Populate error log with enough spread-out entries to produce rate > 5
    const now = Date.now();
    monitor.errorLog['BUS-D'] = [];
    for (let i = 0; i < 60; i++) {
      monitor.errorLog['BUS-D'].push({ timestamp: now - (60000 - i * 1000), error: `err${i}` });
    }
    const busHealth = {
      'BUS-D': { lastSeen: now, nodeCount: 10, online: true },
    };
    const statuses = monitor.getHealthStatus(busHealth);
    expect(statuses['BUS-D'].status).toBe('degraded');
    expect(statuses['BUS-D'].level).toBe('warn');
  });
});

/* ══════════════════════════════════════════════════════
   EXPRESS MIDDLEWARE
   ══════════════════════════════════════════════════════ */

describe('requestLogger middleware', () => {
  test('calls next and logs on response end', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const req = { method: 'GET', path: '/api/test' };
    const originalEnd = jest.fn();
    const res = { statusCode: 200, end: originalEnd };
    const next = jest.fn();

    requestLogger(req, res, next);
    expect(next).toHaveBeenCalled();

    // Simulate response ending
    res.end('body');
    expect(originalEnd).toHaveBeenCalledWith('body');
    spy.mockRestore();
  });
});

describe('jsonParseErrorHandler', () => {
  test('handles entity.parse.failed', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const err = { type: 'entity.parse.failed' };
    const req = {};
    const jsonFn = jest.fn();
    const res = { status: jest.fn(() => ({ json: jsonFn })) };
    const next = jest.fn();

    jsonParseErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'INVALID_JSON' }),
    }));
    expect(next).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('handles entity.too.large', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const err = { type: 'entity.too.large' };
    const req = {};
    const jsonFn = jest.fn();
    const res = { status: jest.fn(() => ({ json: jsonFn })) };
    const next = jest.fn();

    jsonParseErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(next).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('passes unrelated errors to next', () => {
    const err = { type: 'something.else' };
    const req = {};
    const res = {};
    const next = jest.fn();

    jsonParseErrorHandler(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('globalErrorHandler', () => {
  test('handles AppError instances', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const err = new ValidationError('bad input', ['detail1']);
    const req = {};
    const jsonFn = jest.fn();
    const res = { status: jest.fn(() => ({ json: jsonFn })) };
    const next = jest.fn();

    globalErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('handles unexpected errors with 500', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const err = new Error('unexpected crash');
    const req = {};
    const jsonFn = jest.fn();
    const res = { status: jest.fn(() => ({ json: jsonFn })) };
    const next = jest.fn();

    globalErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    }));
    spy.mockRestore();
  });
});

describe('apiNotFoundHandler', () => {
  test('returns 404 for /api/ paths', () => {
    const req = { path: '/api/unknown', method: 'GET' };
    const jsonFn = jest.fn();
    const res = { status: jest.fn(() => ({ json: jsonFn })) };
    const next = jest.fn();

    apiNotFoundHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next for non-API paths', () => {
    const req = { path: '/dashboard', method: 'GET' };
    const res = {};
    const next = jest.fn();

    apiNotFoundHandler(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════
   PROCESS HANDLERS
   ══════════════════════════════════════════════════════ */

describe('setupProcessHandlers', () => {
  let listeners;

  beforeEach(() => {
    listeners = {};
    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      listeners[event] = handler;
    });
  });

  afterEach(() => {
    process.on.mockRestore();
  });

  test('registers all expected handlers', () => {
    setupProcessHandlers();
    expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  test('uncaughtException handler logs error', () => {
    jest.useFakeTimers();
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    setupProcessHandlers();

    const err = new Error('test crash');
    listeners.uncaughtException(err);
    expect(errSpy).toHaveBeenCalled();

    // Advance timers to trigger the delayed process.exit
    jest.advanceTimersByTime(1100);
    expect(exitSpy).toHaveBeenCalledWith(1);

    jest.useRealTimers();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('unhandledRejection handler logs with Error reason', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    setupProcessHandlers();

    listeners.unhandledRejection(new Error('promise fail'));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('unhandledRejection handler logs with string reason', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    setupProcessHandlers();

    listeners.unhandledRejection('string reason');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('SIGTERM handler calls process.exit(0)', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    setupProcessHandlers();

    listeners.SIGTERM();
    expect(exitSpy).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('SIGINT handler calls process.exit(0)', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    setupProcessHandlers();

    listeners.SIGINT();
    expect(exitSpy).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
