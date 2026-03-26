/**
 * BunkScanner — Server API Test Suite
 *
 * Tests backend endpoints, data validation, error handling.
 * Run: npx jest code/test/server.test.js
 */

const request = require('supertest');
const express = require('express');

/* ── Bootstrap a fresh app instance per test ── */

function createApp() {
    const app = express();
    app.use(express.json({ limit: '1mb' }));

    const busData = {};
    const busHealth = {};
    const validBuses = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];

    app.post('/api/bus/data', (req, res) => {
        const payload = req.body;
        if (!payload || !payload.busId || !payload.nodes) {
            return res.status(400).json({ error: 'Invalid payload: requires busId and nodes' });
        }
        if (!validBuses.includes(payload.busId)) {
            return res.status(400).json({ error: 'Unknown busId: ' + payload.busId });
        }
        busData[payload.busId] = { ...payload, receivedAt: Date.now() };
        busHealth[payload.busId] = {
            lastSeen: Date.now(),
            nodeCount: payload.nodeCount || payload.nodes.length,
            online: true,
        };
        res.json({ status: 'ok', busId: payload.busId });
    });

    app.get('/api/site', (_req, res) => {
        const buses = Object.values(busData);
        const now = Date.now();
        for (const bus of buses) {
            bus.stale = (now - bus.receivedAt) > 60000;
        }
        res.json({ timestamp: now, buses, health: busHealth });
    });

    app.get('/api/health', (_req, res) => {
        const now = Date.now();
        const summary = {};
        for (const [busId, health] of Object.entries(busHealth)) {
            summary[busId] = {
                ...health,
                stale: (now - health.lastSeen) > 60000,
                lastSeenAgo: Math.round((now - health.lastSeen) / 1000) + 's',
            };
        }
        res.json({ timestamp: now, totalBuses: Object.keys(summary).length, expectedBuses: 7, buses: summary });
    });

    app.post('/api/bus/:busId/readdress', (req, res) => {
        res.json({ status: 'queued', busId: req.params.busId });
    });

    app._busData = busData;
    app._busHealth = busHealth;
    return app;
}

/* ── Test Fixtures ── */

function makeValidBusPayload(overrides = {}) {
    return {
        busId: 'BUS-D',
        side: 'D',
        timestamp: Date.now(),
        nodeCount: 3,
        nodes: [
            { addr: 1, id: 'D01-S01', status: 0x1F, cam1Fill: 650, cam2Fill: 680, cam3Fill: 700, cam4Fill: 710, avgFill: 685, variance: 60, confidence: 100 },
            { addr: 2, id: 'D01-S02', status: 0x1F, cam1Fill: 400, cam2Fill: 420, cam3Fill: 450, cam4Fill: 430, avgFill: 425, variance: 50, confidence: 100 },
            { addr: 3, id: 'D01-S03', status: 0x0F, cam1Fill: 100, cam2Fill: 90,  cam3Fill: 110, cam4Fill: 95,  avgFill: 99,  variance: 20, confidence: 75 },
        ],
        ...overrides,
    };
}

/* ════════════════════════════════════════════════════════════
   POST /api/bus/data
   ════════════════════════════════════════════════════════════ */

describe('POST /api/bus/data', () => {
    test('accepts valid bus payload', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/data').send(makeValidBusPayload());
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.busId).toBe('BUS-D');
        expect(app._busData['BUS-D']).toBeDefined();
        expect(app._busData['BUS-D'].nodes).toHaveLength(3);
    });

    test('rejects missing busId', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/data').send({ nodes: [] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/requires busId/);
    });

    test('rejects missing nodes', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/data').send({ busId: 'BUS-D' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/requires.*nodes/);
    });

    test('rejects empty body', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/data').send({});
        expect(res.status).toBe(400);
    });

    test('rejects unknown busId', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/data').send({ busId: 'BUS-FAKE', nodes: [] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Unknown busId/);
    });

    test('accepts all 7 valid bus IDs', async () => {
        const app = createApp();
        const ids = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
        for (const busId of ids) {
            const res = await request(app).post('/api/bus/data').send(makeValidBusPayload({ busId }));
            expect(res.status).toBe(200);
        }
        expect(Object.keys(app._busData)).toHaveLength(7);
    });

    test('overwrites previous data for same bus', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload({ nodeCount: 3 }));
        await request(app).post('/api/bus/data').send(makeValidBusPayload({ nodeCount: 5 }));
        expect(app._busData['BUS-D'].nodeCount).toBe(5);
    });

    test('updates bus health tracking', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload());
        expect(app._busHealth['BUS-D']).toBeDefined();
        expect(app._busHealth['BUS-D'].online).toBe(true);
        expect(app._busHealth['BUS-D'].nodeCount).toBe(3);
    });

    test('handles edge fill values (0 and 1000)', async () => {
        const app = createApp();
        const payload = makeValidBusPayload({
            nodes: [
                { addr: 1, id: 'D01-S01', status: 0, cam1Fill: 0, cam2Fill: 0, cam3Fill: 0, cam4Fill: 0, avgFill: 0, variance: 0, confidence: 0 },
                { addr: 2, id: 'D01-S02', status: 0x1F, cam1Fill: 1000, cam2Fill: 1000, cam3Fill: 1000, cam4Fill: 1000, avgFill: 1000, variance: 0, confidence: 100 },
            ],
        });
        const res = await request(app).post('/api/bus/data').send(payload);
        expect(res.status).toBe(200);
    });
});

/* ════════════════════════════════════════════════════════════
   GET /api/site
   ════════════════════════════════════════════════════════════ */

describe('GET /api/site', () => {
    test('returns empty buses when no data posted', async () => {
        const app = createApp();
        const res = await request(app).get('/api/site');
        expect(res.status).toBe(200);
        expect(res.body.buses).toEqual([]);
        expect(res.body.timestamp).toBeDefined();
    });

    test('returns posted bus data', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload());
        const res = await request(app).get('/api/site');
        expect(res.body.buses).toHaveLength(1);
        expect(res.body.buses[0].busId).toBe('BUS-D');
        expect(res.body.buses[0].nodes).toHaveLength(3);
    });

    test('returns data from multiple buses', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload({ busId: 'BUS-D' }));
        await request(app).post('/api/bus/data').send(makeValidBusPayload({ busId: 'BUS-C1' }));
        await request(app).post('/api/bus/data').send(makeValidBusPayload({ busId: 'BUS-B1' }));
        const res = await request(app).get('/api/site');
        expect(res.body.buses).toHaveLength(3);
    });

    test('includes health data', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload());
        const res = await request(app).get('/api/site');
        expect(res.body.health).toBeDefined();
        expect(res.body.health['BUS-D']).toBeDefined();
        expect(res.body.health['BUS-D'].online).toBe(true);
    });
});

/* ════════════════════════════════════════════════════════════
   GET /api/health
   ════════════════════════════════════════════════════════════ */

describe('GET /api/health', () => {
    test('returns empty when no buses reported', async () => {
        const app = createApp();
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.totalBuses).toBe(0);
        expect(res.body.expectedBuses).toBe(7);
    });

    test('tracks bus health after data post', async () => {
        const app = createApp();
        await request(app).post('/api/bus/data').send(makeValidBusPayload());
        const res = await request(app).get('/api/health');
        expect(res.body.totalBuses).toBe(1);
        expect(res.body.buses['BUS-D'].stale).toBe(false);
        expect(res.body.buses['BUS-D'].lastSeenAgo).toBe('0s');
    });
});

/* ════════════════════════════════════════════════════════════
   POST /api/bus/:busId/readdress
   ════════════════════════════════════════════════════════════ */

describe('POST /api/bus/:busId/readdress', () => {
    test('returns queued status', async () => {
        const app = createApp();
        const res = await request(app).post('/api/bus/BUS-D/readdress');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('queued');
        expect(res.body.busId).toBe('BUS-D');
    });
});
