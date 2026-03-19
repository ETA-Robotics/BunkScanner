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
});
