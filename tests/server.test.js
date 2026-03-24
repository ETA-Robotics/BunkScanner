/**
 * BunkScanner — Server API Tests
 *
 * Integration tests for all Express API endpoints using supertest.
 */

const request = require('supertest');

// Suppress log output during tests
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'warn').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

const { app, busData, busHealth } = require('../server');

/* ── Helper: build a valid bus payload ── */
function validBusPayload(overrides = {}) {
  return {
    busId: 'BUS-D',
    nodeCount: 2,
    timestamp: Date.now(),
    nodes: [
      {
        id: 'D01-S01',
        addr: 1,
        status: 15,
        cam1Fill: 500,
        cam2Fill: 480,
        cam3Fill: 510,
        cam4Fill: 490,
        avgFill: 495,
        variance: 30,
        confidence: 80,
      },
      {
        id: 'D01-S02',
        addr: 2,
        status: 15,
        cam1Fill: 600,
        cam2Fill: 620,
        cam3Fill: 590,
        cam4Fill: 610,
        avgFill: 605,
        variance: 30,
        confidence: 85,
      },
    ],
    ...overrides,
  };
}

/* ── Reset state between tests ── */
beforeEach(() => {
  for (const key of Object.keys(busData)) delete busData[key];
  for (const key of Object.keys(busHealth)) delete busHealth[key];
});

/* ══════════════════════════════════════════════════════
   POST /api/bus/data
   ══════════════════════════════════════════════════════ */

describe('POST /api/bus/data', () => {
  test('accepts valid payload and returns ok', async () => {
    const payload = validBusPayload();
    const res = await request(app)
      .post('/api/bus/data')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.busId).toBe('BUS-D');
  });

  test('stores bus data in memory', async () => {
    const payload = validBusPayload();
    await request(app).post('/api/bus/data').send(payload).expect(200);

    expect(busData['BUS-D']).toBeDefined();
    expect(busData['BUS-D'].busId).toBe('BUS-D');
    expect(busData['BUS-D'].receivedAt).toBeDefined();
    expect(busData['BUS-D'].nodes).toHaveLength(2);
  });

  test('updates bus health tracking', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);

    expect(busHealth['BUS-D']).toBeDefined();
    expect(busHealth['BUS-D'].online).toBe(true);
    expect(busHealth['BUS-D'].nodeCount).toBe(2);
    expect(busHealth['BUS-D'].lastSeen).toBeDefined();
  });

  test('overwrites previous data for same bus', async () => {
    await request(app)
      .post('/api/bus/data')
      .send(validBusPayload({ nodeCount: 3 }))
      .expect(200);

    const p2 = validBusPayload({ nodeCount: 5 });
    await request(app).post('/api/bus/data').send(p2).expect(200);

    expect(busData['BUS-D'].nodeCount).toBe(5);
  });

  test('handles all 7 valid bus IDs', async () => {
    const buses = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
    for (const busId of buses) {
      const res = await request(app)
        .post('/api/bus/data')
        .send(validBusPayload({ busId }))
        .expect(200);
      expect(res.body.busId).toBe(busId);
    }
    expect(Object.keys(busData)).toHaveLength(7);
  });

  // ── Rejection cases ──

  test('rejects empty body', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({})
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects missing busId', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({ nodes: [] })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects unknown busId', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({ busId: 'BUS-FAKE', nodes: [] })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects missing nodes array', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({ busId: 'BUS-D' })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects non-array nodes', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({ busId: 'BUS-D', nodes: 'not-array' })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects node with invalid addr', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({
        busId: 'BUS-D',
        nodes: [{ id: 'D01-S01', addr: 999 }],
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects node with out-of-range avgFill', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({
        busId: 'BUS-D',
        nodes: [{ id: 'D01-S01', avgFill: 2000 }],
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }')
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('uses nodeCount from payload when provided', async () => {
    await request(app)
      .post('/api/bus/data')
      .send(validBusPayload({ nodeCount: 10 }))
      .expect(200);

    expect(busHealth['BUS-D'].nodeCount).toBe(10);
  });

  test('falls back to nodes.length when nodeCount not provided', async () => {
    const payload = validBusPayload();
    delete payload.nodeCount;
    await request(app).post('/api/bus/data').send(payload).expect(200);

    expect(busHealth['BUS-D'].nodeCount).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════
   GET /api/site
   ══════════════════════════════════════════════════════ */

describe('GET /api/site', () => {
  test('returns empty buses when no data posted', async () => {
    const res = await request(app)
      .get('/api/site')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.timestamp).toBeDefined();
    expect(res.body.buses).toEqual([]);
    expect(res.body.health).toEqual({});
  });

  test('returns posted bus data', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);

    const res = await request(app).get('/api/site').expect(200);

    expect(res.body.buses).toHaveLength(1);
    expect(res.body.buses[0].busId).toBe('BUS-D');
    expect(res.body.buses[0].nodes).toHaveLength(2);
  });

  test('returns data from multiple buses', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload({ busId: 'BUS-D' })).expect(200);
    await request(app).post('/api/bus/data').send(validBusPayload({ busId: 'BUS-C1' })).expect(200);
    await request(app).post('/api/bus/data').send(validBusPayload({ busId: 'BUS-B1' })).expect(200);

    const res = await request(app).get('/api/site').expect(200);

    expect(res.body.buses).toHaveLength(3);
  });

  test('marks fresh data as not stale', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);

    const res = await request(app).get('/api/site').expect(200);

    expect(res.body.buses[0].stale).toBe(false);
  });

  test('marks old data as stale', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);
    // Manually backdate
    busData['BUS-D'].receivedAt = Date.now() - 120000;

    const res = await request(app).get('/api/site').expect(200);

    expect(res.body.buses[0].stale).toBe(true);
  });

  test('includes health data', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);

    const res = await request(app).get('/api/site').expect(200);

    expect(res.body.health['BUS-D']).toBeDefined();
    expect(res.body.health['BUS-D'].online).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════
   GET /api/health
   ══════════════════════════════════════════════════════ */

describe('GET /api/health', () => {
  test('returns health summary with zero buses initially', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.totalBuses).toBe(0);
    expect(res.body.expectedBuses).toBe(7);
    expect(res.body.buses).toBeDefined();
    expect(res.body.diagnostics).toBeDefined();
  });

  test('reflects posted bus health', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);

    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.totalBuses).toBe(1);
    expect(res.body.buses['BUS-D']).toBeDefined();
    expect(res.body.buses['BUS-D'].stale).toBe(false);
  });

  test('shows stale indicator for old data', async () => {
    await request(app).post('/api/bus/data').send(validBusPayload()).expect(200);
    busHealth['BUS-D'].lastSeen = Date.now() - 90000;

    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.buses['BUS-D'].stale).toBe(true);
    expect(res.body.buses['BUS-D'].lastSeenAgo).toMatch(/\d+s/);
  });

  test('includes diagnostics for all expected buses', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(Object.keys(res.body.diagnostics)).toHaveLength(7);
  });
});

/* ══════════════════════════════════════════════════════
   POST /api/bus/:busId/readdress
   ══════════════════════════════════════════════════════ */

describe('POST /api/bus/:busId/readdress', () => {
  test('accepts valid busId', async () => {
    const res = await request(app)
      .post('/api/bus/BUS-D/readdress')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.status).toBe('queued');
    expect(res.body.busId).toBe('BUS-D');
  });

  test('accepts all valid bus IDs', async () => {
    const buses = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
    for (const busId of buses) {
      await request(app).post(`/api/bus/${busId}/readdress`).expect(200);
    }
  });

  test('rejects invalid busId', async () => {
    const res = await request(app)
      .post('/api/bus/BUS-FAKE/readdress')
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

/* ══════════════════════════════════════════════════════
   UNKNOWN API ROUTES
   ══════════════════════════════════════════════════════ */

describe('Unknown API routes', () => {
  test('returns 404 JSON for unknown API path', async () => {
    const res = await request(app)
      .get('/api/nonexistent')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('returns 404 for unknown API POST', async () => {
    const res = await request(app)
      .post('/api/nonexistent')
      .send({})
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

/* ══════════════════════════════════════════════════════
   CONCURRENT BUS UPDATES
   ══════════════════════════════════════════════════════ */

describe('Concurrent operations', () => {
  test('handles rapid sequential posts from same bus', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/bus/data')
        .send(validBusPayload({ nodeCount: i }))
        .expect(200);
    }
    expect(busData['BUS-D'].nodeCount).toBe(9);
  });

  test('handles parallel posts from different buses', async () => {
    const buses = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
    const results = await Promise.all(
      buses.map(busId =>
        request(app).post('/api/bus/data').send(validBusPayload({ busId }))
      )
    );

    results.forEach(res => expect(res.status).toBe(200));
    expect(Object.keys(busData)).toHaveLength(7);
  });
});

/* ══════════════════════════════════════════════════════
   EDGE CASES
   ══════════════════════════════════════════════════════ */

describe('Edge cases', () => {
  test('handles payload with zero nodes', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .send({ busId: 'BUS-D', nodes: [] })
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  test('handles payload with maximum node count', async () => {
    const nodes = [];
    for (let i = 1; i <= 128; i++) {
      nodes.push({
        id: `D01-S${String(i).padStart(2, '0')}`,
        addr: Math.min(i, 247),
        avgFill: 500,
        status: 15,
        cam1Fill: 500,
        cam2Fill: 500,
        cam3Fill: 500,
        cam4Fill: 500,
        variance: 0,
        confidence: 100,
      });
    }
    const res = await request(app)
      .post('/api/bus/data')
      .send({ busId: 'BUS-D', nodes, nodeCount: 128 })
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  test('GET /api/site immediately after server start', async () => {
    const res = await request(app).get('/api/site').expect(200);
    expect(res.body.buses).toEqual([]);
  });

  test('content-type must be json for bus data', async () => {
    const res = await request(app)
      .post('/api/bus/data')
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('SPA fallback serves HTML for non-API routes', async () => {
    const res = await request(app).get('/dashboard');
    // Either 200 with HTML or 404 if index.html missing in test env
    expect([200, 404]).toContain(res.status);
  });

  test('SPA fallback for nested non-API path', async () => {
    const res = await request(app).get('/some/deep/path');
    expect([200, 404]).toContain(res.status);
  });
});
