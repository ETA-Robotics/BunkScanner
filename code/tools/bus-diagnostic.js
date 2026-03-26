#!/usr/bin/env node
/**
 * BunkScanner — RS485 Bus Diagnostic Tool
 *
 * Interactive CLI tool for diagnosing RS485 bus and server issues.
 * Simulates Opta gateway traffic, tests server endpoints, and
 * validates data flow end-to-end.
 *
 * Usage:
 *   node code/tools/bus-diagnostic.js [command] [options]
 *
 * Commands:
 *   simulate    — Push simulated bus data to server
 *   health      — Check server health endpoint
 *   stress      — Stress test with all 7 buses
 *   validate    — Validate a node data payload
 *   crc         — Calculate Modbus CRC-16 for hex bytes
 *   frame       — Build and display a Modbus frame
 *   timeline    — Show expected bus timing calculations
 *   power       — Show power budget calculations
 */

const http = require('http');

/* ── Configuration ── */
const SERVER_HOST = process.env.BUNK_HOST || 'localhost';
const SERVER_PORT = process.env.BUNK_PORT || 3000;

const VALID_BUSES = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
const BUS_CONFIG = {
    'BUS-D':  { side: 'D', penStart: 1,  penEnd: 8,  nodes: 117 },
    'BUS-C1': { side: 'C', penStart: 1,  penEnd: 8,  nodes: 108 },
    'BUS-C2': { side: 'C', penStart: 9,  penEnd: 15, nodes: 107 },
    'BUS-B1': { side: 'B', penStart: 1,  penEnd: 10, nodes: 104 },
    'BUS-B2': { side: 'B', penStart: 11, penEnd: 20, nodes: 104 },
    'BUS-Z1': { side: 'Z', penStart: 1,  penEnd: 5,  nodes: 104 },
    'BUS-Z2': { side: 'Z', penStart: 6,  penEnd: 10, nodes: 104 },
};

/* ── Colors ── */
const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function log(color, label, msg) {
    console.log(`${color}[${label}]${C.reset} ${msg}`);
}

/* ── CRC-16/Modbus ── */
function modbusCRC16(data) {
    let crc = 0xFFFF;
    for (const byte of data) {
        crc ^= byte;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
        }
    }
    return crc & 0xFFFF;
}

/* ── HTTP Helper ── */
function httpRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path,
            method,
            headers: { 'Content-Type': 'application/json' },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/* ── Generate Simulated Node Data ── */
function generateNodes(busId, count) {
    const config = BUS_CONFIG[busId];
    const nodes = [];
    let pen = config.penStart;
    let seg = 1;

    for (let i = 0; i < count; i++) {
        const fillBase = Math.random() * 100;
        const id = `${config.side}${String(pen).padStart(2, '0')}-S${String(seg).padStart(2, '0')}`;

        // Simulate various health states
        const faultChance = Math.random();
        let status = 0x1F; // All OK + addressed
        if (faultChance < 0.05) status = 0x17; // CAM4 fault
        if (faultChance < 0.02) status = 0x0F; // Not addressed (shouldn't happen)

        nodes.push({
            addr: i + 1,
            id,
            status,
            cam1Fill: Math.round(fillBase * 10 + (Math.random() - 0.5) * 50),
            cam2Fill: Math.round(fillBase * 10 + (Math.random() - 0.5) * 50),
            cam3Fill: Math.round(fillBase * 10 + (Math.random() - 0.5) * 50),
            cam4Fill: Math.round(fillBase * 10 + (Math.random() - 0.5) * 50),
            avgFill: Math.round(fillBase * 10),
            variance: Math.round(Math.random() * 150),
            confidence: status === 0x1F ? 100 : 75,
        });

        seg++;
        // Approximate pen boundary every ~12 segments
        if (seg > 12 && pen < config.penEnd) {
            pen++;
            seg = 1;
        }
    }
    return nodes;
}

/* ════════════════════════════════════════════════════════════
   COMMANDS
   ════════════════════════════════════════════════════════════ */

async function cmdSimulate(busId, count) {
    busId = busId || 'BUS-D';
    count = parseInt(count) || 10;

    if (!VALID_BUSES.includes(busId)) {
        log(C.red, 'ERROR', `Invalid bus ID: ${busId}`);
        log(C.dim, 'VALID', VALID_BUSES.join(', '));
        process.exit(1);
    }

    log(C.cyan, 'SIM', `Generating ${count} nodes for ${busId}...`);
    const nodes = generateNodes(busId, count);
    const payload = {
        busId,
        side: BUS_CONFIG[busId].side,
        timestamp: Date.now(),
        nodeCount: count,
        nodes,
    };

    try {
        const res = await httpRequest('POST', '/api/bus/data', payload);
        if (res.status === 200) {
            log(C.green, 'OK', `Server accepted ${count} nodes for ${busId}`);
            log(C.dim, 'RESP', JSON.stringify(res.body));
        } else {
            log(C.red, 'FAIL', `Server returned ${res.status}: ${JSON.stringify(res.body)}`);
        }
    } catch (e) {
        log(C.red, 'ERROR', `Cannot connect to server at ${SERVER_HOST}:${SERVER_PORT}`);
        log(C.yellow, 'HINT', 'Is the server running? Try: npm start');
    }
}

async function cmdHealth() {
    log(C.cyan, 'HEALTH', `Checking ${SERVER_HOST}:${SERVER_PORT}...`);

    try {
        const res = await httpRequest('GET', '/api/health');
        const h = res.body;

        console.log();
        log(C.bold, 'BUS HEALTH REPORT', new Date().toISOString());
        console.log(`  Expected buses: ${h.expectedBuses}`);
        console.log(`  Reporting buses: ${h.totalBuses}`);
        console.log(`  Missing: ${h.expectedBuses - h.totalBuses}`);
        console.log();

        if (h.buses && Object.keys(h.buses).length > 0) {
            console.log('  Bus ID     | Status  | Nodes | Last Seen');
            console.log('  -----------+---------+-------+----------');
            for (const busId of VALID_BUSES) {
                const bus = h.buses[busId];
                if (bus) {
                    const status = bus.stale ? `${C.red}STALE${C.reset}` : `${C.green}OK${C.reset}   `;
                    console.log(`  ${busId.padEnd(10)} | ${status}  | ${String(bus.nodeCount).padStart(5)} | ${bus.lastSeenAgo}`);
                } else {
                    console.log(`  ${busId.padEnd(10)} | ${C.red}MISSING${C.reset} |   --- | never`);
                }
            }
        } else {
            log(C.yellow, 'WARN', 'No buses have reported yet');
        }
        console.log();
    } catch (e) {
        log(C.red, 'ERROR', `Cannot connect to server at ${SERVER_HOST}:${SERVER_PORT}`);
        log(C.yellow, 'HINT', 'Is the server running? Try: npm start');
    }
}

async function cmdStress() {
    log(C.cyan, 'STRESS', 'Sending data for all 7 buses...');
    const results = [];

    for (const busId of VALID_BUSES) {
        const config = BUS_CONFIG[busId];
        const nodes = generateNodes(busId, config.nodes);
        const payload = {
            busId,
            side: config.side,
            timestamp: Date.now(),
            nodeCount: config.nodes,
            nodes,
        };

        try {
            const start = Date.now();
            const res = await httpRequest('POST', '/api/bus/data', payload);
            const elapsed = Date.now() - start;

            results.push({
                busId,
                status: res.status,
                nodes: config.nodes,
                elapsed,
                ok: res.status === 200,
            });

            const color = res.status === 200 ? C.green : C.red;
            log(color, busId, `${config.nodes} nodes -> ${res.status} (${elapsed}ms)`);
        } catch (e) {
            results.push({ busId, status: 0, nodes: config.nodes, elapsed: 0, ok: false });
            log(C.red, busId, `FAILED: ${e.message}`);
        }
    }

    console.log();
    const totalNodes = results.reduce((s, r) => s + r.nodes, 0);
    const totalTime = results.reduce((s, r) => s + r.elapsed, 0);
    const allOk = results.every(r => r.ok);

    log(allOk ? C.green : C.red, 'RESULT',
        `${totalNodes} nodes across 7 buses in ${totalTime}ms — ${allOk ? 'ALL OK' : 'SOME FAILED'}`);

    // Verify health endpoint
    const health = await httpRequest('GET', '/api/health');
    log(C.cyan, 'VERIFY', `Health reports ${health.body.totalBuses}/7 buses online`);
}

function cmdValidate(jsonStr) {
    if (!jsonStr) {
        log(C.red, 'ERROR', 'Usage: node bus-diagnostic.js validate \'{"busId":"BUS-D",...}\'');
        process.exit(1);
    }

    let payload;
    try {
        payload = JSON.parse(jsonStr);
    } catch {
        log(C.red, 'PARSE', 'Invalid JSON');
        process.exit(1);
    }

    const errors = [];
    const warnings = [];

    // Required fields
    if (!payload.busId) errors.push('Missing busId');
    else if (!VALID_BUSES.includes(payload.busId)) errors.push(`Unknown busId: ${payload.busId}`);

    if (!payload.nodes) errors.push('Missing nodes array');
    else if (!Array.isArray(payload.nodes)) errors.push('nodes must be an array');

    if (!payload.side) warnings.push('Missing side field');

    // Validate each node
    if (Array.isArray(payload.nodes)) {
        const seenAddrs = new Set();
        const seenIds = new Set();

        for (let i = 0; i < payload.nodes.length; i++) {
            const node = payload.nodes[i];
            const prefix = `nodes[${i}]`;

            if (node.addr === undefined) errors.push(`${prefix}: missing addr`);
            else if (node.addr < 1 || node.addr > 247) errors.push(`${prefix}: addr ${node.addr} out of range (1-247)`);
            else if (seenAddrs.has(node.addr)) errors.push(`${prefix}: duplicate addr ${node.addr}`);
            else seenAddrs.add(node.addr);

            if (!node.id) errors.push(`${prefix}: missing id`);
            else {
                if (!/^[A-Z]\d{2}-S\d{2}$/.test(node.id)) errors.push(`${prefix}: invalid id format "${node.id}" (expected e.g. D01-S05)`);
                if (seenIds.has(node.id)) errors.push(`${prefix}: duplicate id ${node.id}`);
                else seenIds.add(node.id);
            }

            // Fill value ranges
            for (const field of ['cam1Fill', 'cam2Fill', 'cam3Fill', 'cam4Fill', 'avgFill']) {
                if (node[field] !== undefined && (node[field] < 0 || node[field] > 1000)) {
                    warnings.push(`${prefix}: ${field}=${node[field]} outside 0-1000 range`);
                }
            }

            if (node.confidence !== undefined && (node.confidence < 0 || node.confidence > 100)) {
                warnings.push(`${prefix}: confidence=${node.confidence} outside 0-100 range`);
            }
        }
    }

    // Report
    console.log();
    log(C.bold, 'VALIDATION', `Payload for ${payload.busId || '(unknown)'}`);
    console.log(`  Nodes: ${payload.nodes ? payload.nodes.length : 0}`);

    if (errors.length === 0 && warnings.length === 0) {
        log(C.green, 'PASS', 'Payload is valid');
    }

    if (errors.length > 0) {
        log(C.red, 'ERRORS', `${errors.length} error(s):`);
        errors.forEach(e => console.log(`    ${C.red}x${C.reset} ${e}`));
    }

    if (warnings.length > 0) {
        log(C.yellow, 'WARNINGS', `${warnings.length} warning(s):`);
        warnings.forEach(w => console.log(`    ${C.yellow}!${C.reset} ${w}`));
    }

    console.log();
    process.exit(errors.length > 0 ? 1 : 0);
}

function cmdCRC(hexStr) {
    if (!hexStr) {
        log(C.red, 'ERROR', 'Usage: node bus-diagnostic.js crc "01 03 00 00 00 0A"');
        process.exit(1);
    }

    const bytes = hexStr.trim().split(/[\s,]+/).map(h => parseInt(h, 16));
    if (bytes.some(isNaN)) {
        log(C.red, 'ERROR', 'Invalid hex bytes');
        process.exit(1);
    }

    const crc = modbusCRC16(bytes);
    console.log();
    log(C.cyan, 'INPUT', bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    log(C.green, 'CRC-16', `0x${crc.toString(16).padStart(4, '0').toUpperCase()} (${crc})`);
    log(C.green, 'FRAME', [...bytes, crc & 0xFF, (crc >> 8) & 0xFF]
        .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));

    // Verify
    const fullFrame = [...bytes, crc & 0xFF, (crc >> 8) & 0xFF];
    const check = modbusCRC16(fullFrame);
    log(check === 0 ? C.green : C.red, 'CHECK', check === 0 ? 'CRC validates OK' : `CRC invalid: ${check}`);
    console.log();
}

function cmdFrame(type, ...args) {
    const frames = {
        'read': () => {
            const addr = parseInt(args[0]) || 1;
            const startReg = parseInt(args[1]) || 0;
            const numRegs = parseInt(args[2]) || 8;
            return { label: `Read ${numRegs} regs from slave ${addr} starting at ${startReg}`,
                     bytes: [addr, 0x03, (startReg >> 8) & 0xFF, startReg & 0xFF, (numRegs >> 8) & 0xFF, numRegs & 0xFF] };
        },
        'assign': () => {
            const addr = parseInt(args[0]) || 1;
            return { label: `Assign address ${addr} (broadcast)`, bytes: [0x00, 0x41, addr] };
        },
        'complete': () => {
            return { label: 'Address complete (broadcast)', bytes: [0x00, 0x42] };
        },
    };

    if (!type || !frames[type]) {
        console.log('Frame types: read [addr] [startReg] [numRegs] | assign [addr] | complete');
        process.exit(1);
    }

    const { label, bytes } = frames[type]();
    const crc = modbusCRC16(bytes);
    const frame = [...bytes, crc & 0xFF, (crc >> 8) & 0xFF];

    console.log();
    log(C.cyan, 'FRAME', label);
    log(C.green, 'HEX', frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    log(C.dim, 'LEN', `${frame.length} bytes`);
    const timeUs = frame.length * (11 / 115200) * 1e6;
    log(C.dim, 'TIME', `${timeUs.toFixed(0)}us at 115200 baud`);
    console.log();
}

function cmdTimeline() {
    const CHAR_US = (11 / 115200) * 1e6;
    const T35 = CHAR_US * 3.5;

    console.log();
    log(C.bold, 'BUS TIMING', '115200 baud, 11 bits/char');
    console.log();
    console.log('  Character time:        ' + CHAR_US.toFixed(1) + ' us');
    console.log('  3.5-char timeout:      ' + T35.toFixed(0) + ' us');
    console.log();
    console.log('  -- Per-Node Poll --');
    console.log('  Request (8 bytes):     ' + (8 * CHAR_US).toFixed(0) + ' us');
    console.log('  Response (21 bytes):   ' + (21 * CHAR_US).toFixed(0) + ' us');
    console.log('  Interframe gap:        ' + T35.toFixed(0) + ' us');
    const perNode = (8 + 21) * CHAR_US + T35;
    console.log('  Total per node:        ' + (perNode / 1000).toFixed(2) + ' ms');
    console.log();
    console.log('  -- Bus Poll (all nodes) --');
    for (const [busId, cfg] of Object.entries(BUS_CONFIG)) {
        const totalMs = cfg.nodes * perNode / 1000;
        console.log(`  ${busId.padEnd(8)} (${String(cfg.nodes).padStart(3)} nodes): ${totalMs.toFixed(0).padStart(5)} ms  (${(totalMs / 30000 * 100).toFixed(1)}% of 30s interval)`);
    }
    const totalNodes = Object.values(BUS_CONFIG).reduce((s, c) => s + c.nodes, 0);
    console.log();
    console.log(`  Total system: ${totalNodes} nodes across 7 buses (polled in parallel)`);
    console.log(`  Slowest bus:  ${Math.max(...Object.values(BUS_CONFIG).map(c => c.nodes))} nodes = ${(Math.max(...Object.values(BUS_CONFIG).map(c => c.nodes)) * perNode / 1000).toFixed(0)} ms`);
    console.log();
}

function cmdPower() {
    const NODE_MA_3V3 = 111;
    const BUCK_EFF = 0.85;
    const NODE_MA_24V = NODE_MA_3V3 * 3.3 / (24 * BUCK_EFF);

    console.log();
    log(C.bold, 'POWER BUDGET', '24V DC Bus, 2.5mm2 cable');
    console.log();
    console.log('  -- Per Node --');
    console.log('  STM32G071:       30 mA @ 3.3V');
    console.log('  4x VL53L7CX:     80 mA @ 3.3V (peak)');
    console.log('  RS485 xcvr:       1 mA @ 3.3V');
    console.log('  Total @ 3.3V:   ' + NODE_MA_3V3 + ' mA');
    console.log('  With buck (' + (BUCK_EFF * 100) + '% eff): ' + NODE_MA_24V.toFixed(1) + ' mA @ 24V');
    console.log();
    console.log('  -- Per Bus --');

    for (const [busId, cfg] of Object.entries(BUS_CONFIG)) {
        const busCurrentA = cfg.nodes * NODE_MA_24V / 1000;
        const busWatts = busCurrentA * 24;
        const halfLen = (busId.includes('D') ? 280 : 250) / 2; // meters to midpoint
        const resistance = 7.4e-3 * halfLen * 2;
        const vDrop = (busCurrentA / 2) * resistance; // dual injection
        const vEnd = 24 - vDrop;

        const vColor = vEnd > 18 ? C.green : vEnd > 15 ? C.yellow : C.red;
        console.log(`  ${busId.padEnd(8)}: ${cfg.nodes} nodes x ${NODE_MA_24V.toFixed(1)}mA = ${busCurrentA.toFixed(2)}A (${busWatts.toFixed(0)}W)  Vmin=${vColor}${vEnd.toFixed(1)}V${C.reset}`);
    }

    const totalNodes = Object.values(BUS_CONFIG).reduce((s, c) => s + c.nodes, 0);
    const totalA = totalNodes * NODE_MA_24V / 1000;
    const totalW = totalA * 24;
    console.log();
    console.log(`  System total: ${totalNodes} nodes, ${totalA.toFixed(1)}A, ${totalW.toFixed(0)}W`);
    console.log(`  PSU needed: 14x Mean Well HDR-60-24 (24V/2.5A each)`);
    console.log();
}

/* ════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════ */

const [,, cmd, ...args] = process.argv;

const commands = {
    simulate:  () => cmdSimulate(args[0], args[1]),
    health:    () => cmdHealth(),
    stress:    () => cmdStress(),
    validate:  () => cmdValidate(args[0]),
    crc:       () => cmdCRC(args.join(' ')),
    frame:     () => cmdFrame(args[0], ...args.slice(1)),
    timeline:  () => cmdTimeline(),
    power:     () => cmdPower(),
};

if (!cmd || !commands[cmd]) {
    console.log(`
${C.bold}BunkScanner Bus Diagnostic Tool${C.reset}

${C.cyan}Usage:${C.reset} node code/tools/bus-diagnostic.js <command> [args]

${C.cyan}Server Commands:${C.reset}
  simulate [busId] [count]    Push simulated data to server
  health                      Check bus health via server API
  stress                      Push all 7 buses with full node counts

${C.cyan}Validation:${C.reset}
  validate '<json>'           Validate a node data payload

${C.cyan}Protocol Tools:${C.reset}
  crc "01 03 00 00 00 0A"     Calculate Modbus CRC-16
  frame read [addr] [start] [count]    Build read holding frame
  frame assign [addr]         Build assign address frame
  frame complete              Build addr complete frame

${C.cyan}Reference:${C.reset}
  timeline                    Show bus timing calculations
  power                       Show power budget calculations

${C.cyan}Environment:${C.reset}
  BUNK_HOST=localhost         Server hostname (default: localhost)
  BUNK_PORT=3000              Server port (default: 3000)
`);
    process.exit(0);
}

commands[cmd]();
