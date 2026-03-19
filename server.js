/**
 * BunkScanner Backend Server
 *
 * Lightweight Node.js/Express server that:
 * 1. Receives POST /api/bus/data from Opta gateways (RS485 bus data)
 * 2. Aggregates data from all 7 buses into a unified site view
 * 3. Serves GET /api/site to the web dashboard
 * 4. Serves the static web frontend
 *
 * Run: node server.js
 * Requires: npm install express
 */

const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const MAX_BODY_SIZE = '1mb';

app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.static(path.join(__dirname, 'web')));

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

    if (!payload || !payload.busId || !payload.nodes) {
        return res.status(400).json({ error: 'Invalid payload: requires busId and nodes' });
    }

    // Validate busId against known buses
    const validBuses = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
    if (!validBuses.includes(payload.busId)) {
        return res.status(400).json({ error: 'Unknown busId: ' + payload.busId });
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

    console.log(`[BUS] ${payload.busId}: ${payload.nodes.length} nodes received`);
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

    res.json({
        timestamp: now,
        totalBuses: Object.keys(summary).length,
        expectedBuses: 7,
        buses: summary,
    });
});

/* ══════════════════════════════════════════════════════
   API: Trigger re-addressing on a specific bus
   POST /api/bus/:busId/readdress
   ══════════════════════════════════════════════════════ */

app.post('/api/bus/:busId/readdress', (req, res) => {
    const { busId } = req.params;
    // In production, this would send a command to the Opta gateway
    // For now, just clear the bus data to force a refresh
    console.log(`[CMD] Re-address requested for ${busId}`);
    res.json({ status: 'queued', busId: busId });
});

/* ══════════════════════════════════════════════════════
   STATIC FALLBACK — Serve index.html for SPA routes
   ══════════════════════════════════════════════════════ */

app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

/* ══════════════════════════════════════════════════════
   START SERVER
   ══════════════════════════════════════════════════════ */

app.listen(PORT, () => {
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
