/**
 * BunkScanner Backend Server
 *
 * Lightweight Node.js/Express server that:
 * 1. Receives POST /api/bus/data from Opta gateways (RS485 bus data)
 * 2. Aggregates data from all 7 buses into a unified site view
 * 3. Serves GET /api/site to the web dashboard
 * 4. Serves the static web frontend
 *
 * Run: node code/server.js
 * Requires: npm install express
 */

const express = require('express');
const path = require('path');
const {
  logger,
  validateBusPayload,
  BusHealthMonitor,
  requestLogger,
  jsonParseErrorHandler,
  globalErrorHandler,
  apiNotFoundHandler,
  setupProcessHandlers,
  VALID_BUSES,
} = require('./lib/errorHandler');

const app = express();

const PORT = process.env.PORT || 3000;
const MAX_BODY_SIZE = '1mb';

/* ══════════════════════════════════════════════════════
   MIDDLEWARE
   ══════════════════════════════════════════════════════ */

app.use(requestLogger);
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(jsonParseErrorHandler);
app.use(express.static(path.join(__dirname, 'web')));

const healthMonitor = new BusHealthMonitor();

/* ══════════════════════════════════════════════════════
   IN-MEMORY DATA STORE
   ══════════════════════════════════════════════════════ */

// Stores latest data from each bus, keyed by busId
const busData = {};

// Bus health tracking
const busHealth = {};

/* ══════════════════════════════════════════════════════
   API: Receive bus data from Opta gateways
   POST /api/bus/data
   ══════════════════════════════════════════════════════ */

app.post('/api/bus/data', (req, res) => {
    const payload = req.body;

    try {
        validateBusPayload(payload);
    } catch (err) {
        logger.warn('BUS', `Invalid payload from ${req.ip}: ${err.message}`);
        return res.status(err.statusCode || 400).json(err.toJSON ? err.toJSON() : { error: err.message });
    }

    // Store with server timestamp
    busData[payload.busId] = {
        ...payload,
        receivedAt: Date.now(),
    };

    // Update health
    busHealth[payload.busId] = {
        lastSeen: Date.now(),
        nodeCount: payload.nodeCount || payload.nodes.length,
        online: true,
    };

    logger.info('BUS', `${payload.busId}: ${payload.nodes.length} nodes received`);
    res.json({ status: 'ok', busId: payload.busId });
});

/* ══════════════════════════════════════════════════════
   API: Get aggregated site data for web dashboard
   GET /api/site
   ══════════════════════════════════════════════════════ */

app.get('/api/site', (_req, res) => {
    // Return all bus data for the frontend to merge into its data model
    const buses = Object.values(busData);

    // Mark stale buses (no data for >60s)
    const now = Date.now();
    for (const bus of buses) {
        bus.stale = (now - bus.receivedAt) > 60000;
    }

    res.json({
        timestamp: now,
        buses: buses,
        health: busHealth,
    });
});

/* ══════════════════════════════════════════════════════
   API: Get bus health summary
   GET /api/health
   ══════════════════════════════════════════════════════ */

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

    // Include health monitor diagnostics
    const diagnostics = healthMonitor.getHealthStatus(busHealth);

    res.json({
        timestamp: now,
        totalBuses: Object.keys(summary).length,
        expectedBuses: 7,
        buses: summary,
        diagnostics,
    });
});

/* ══════════════════════════════════════════════════════
   API: Trigger re-addressing on a specific bus
   POST /api/bus/:busId/readdress
   ══════════════════════════════════════════════════════ */

app.post('/api/bus/:busId/readdress', (req, res) => {
    const { busId } = req.params;

    if (!VALID_BUSES.includes(busId)) {
        return res.status(400).json({ error: { code: 'INVALID_BUS', message: `Unknown busId: ${busId}` } });
    }

    // In production, this would send a command to the Opta gateway
    // For now, just clear the bus data to force a refresh
    logger.info('CMD', `Re-address requested for ${busId}`);
    res.json({ status: 'queued', busId: busId });
});

/* ══════════════════════════════════════════════════════
   STATIC FALLBACK — Serve index.html for SPA routes
   ══════════════════════════════════════════════════════ */

app.use(apiNotFoundHandler);

app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

/* ══════════════════════════════════════════════════════
   GLOBAL ERROR HANDLER (must be last middleware)
   ══════════════════════════════════════════════════════ */

app.use(globalErrorHandler);

/* ══════════════════════════════════════════════════════
   START SERVER (only when run directly)
   ══════════════════════════════════════════════════════ */

if (require.main === module) {
    setupProcessHandlers();

    app.listen(PORT, () => {
        logger.info('SERVER', 'BunkScanner Server started', { port: PORT });
        console.log('==============================');
        console.log('BunkScanner Server');
        console.log(`Listening on port ${PORT}`);
        console.log('==============================');
        console.log('Endpoints:');
        console.log(`  POST /api/bus/data      — Receive Opta gateway data`);
        console.log(`  GET  /api/site          — Aggregated site data for dashboard`);
        console.log(`  GET  /api/health        — Bus health summary`);
        console.log(`  POST /api/bus/:id/readdress — Trigger re-addressing`);
        console.log('==============================');
    });
}

/* ══════════════════════════════════════════════════════
   EXPORTS (for testing)
   ══════════════════════════════════════════════════════ */

module.exports = { app, busData, busHealth, healthMonitor };
