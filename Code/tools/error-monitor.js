#!/usr/bin/env node
/**
 * BunkScanner — Error Monitor & Alert Tool
 *
 * Continuously monitors the BunkScanner server for errors and anomalies.
 * Catches and reports:
 *   - Offline/stale buses
 *   - Missing nodes on a bus
 *   - Sensor faults (camera health bits)
 *   - Out-of-range fill values
 *   - High variance (uneven fill)
 *   - Low confidence readings
 *   - Server connectivity issues
 *
 * Usage:
 *   node Code/tools/error-monitor.js [--interval 10] [--once]
 *
 * Options:
 *   --interval N   Poll interval in seconds (default: 10)
 *   --once         Run once and exit
 *   --json         Output JSON instead of formatted text
 *   --strict       Exit with code 1 if any errors found (for CI)
 */

const http = require('http');

/* ── Configuration ── */
const SERVER_HOST = process.env.BUNK_HOST || 'localhost';
const SERVER_PORT = process.env.BUNK_PORT || 3000;

const EXPECTED_BUSES = ['BUS-D', 'BUS-C1', 'BUS-C2', 'BUS-B1', 'BUS-B2', 'BUS-Z1', 'BUS-Z2'];
const EXPECTED_NODE_COUNTS = {
    'BUS-D': 117, 'BUS-C1': 108, 'BUS-C2': 107,
    'BUS-B1': 104, 'BUS-B2': 104, 'BUS-Z1': 104, 'BUS-Z2': 104,
};

/* ── Thresholds ── */
const STALE_TIMEOUT_S = 60;
const FILL_MIN = 0;
const FILL_MAX = 1000;
const VARIANCE_WARN = 250;    // x10 = 25.0%
const CONFIDENCE_WARN = 50;
const NODE_LOSS_WARN_PCT = 10; // Warn if >10% nodes missing

/* ── Colors ── */
const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
    bgRed: '\x1b[41m', bgYellow: '\x1b[43m',
};

/* ── Error Severity ── */
const SEV = {
    CRITICAL: { label: 'CRIT', color: C.bgRed + C.bold },
    ERROR:    { label: 'ERR ', color: C.red },
    WARNING:  { label: 'WARN', color: C.yellow },
    INFO:     { label: 'INFO', color: C.cyan },
    OK:       { label: ' OK ', color: C.green },
};

/* ── Parse CLI args ── */
const cliArgs = process.argv.slice(2);
let pollInterval = 10;
let runOnce = false;
let outputJson = false;
let strictMode = false;

for (let i = 0; i < cliArgs.length; i++) {
    if (cliArgs[i] === '--interval' && cliArgs[i + 1]) { pollInterval = parseInt(cliArgs[i + 1]); i++; }
    if (cliArgs[i] === '--once') runOnce = true;
    if (cliArgs[i] === '--json') outputJson = true;
    if (cliArgs[i] === '--strict') strictMode = true;
}

/* ── HTTP Helper ── */
function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: SERVER_HOST, port: SERVER_PORT, path }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

/* ── Diagnostic Check ── */
async function runDiagnostics() {
    const issues = [];
    const timestamp = new Date().toISOString();

    // 1. Check server connectivity
    let healthData, siteData;
    try {
        healthData = await httpGet('/api/health');
        siteData = await httpGet('/api/site');
    } catch (e) {
        issues.push({
            severity: 'CRITICAL',
            source: 'SERVER',
            message: `Cannot connect to server at ${SERVER_HOST}:${SERVER_PORT}`,
            detail: e.message,
        });
        return { timestamp, issues, serverOnline: false };
    }

    if (healthData.status !== 200) {
        issues.push({
            severity: 'CRITICAL',
            source: 'SERVER',
            message: `Health endpoint returned ${healthData.status}`,
        });
        return { timestamp, issues, serverOnline: true };
    }

    const health = healthData.body;
    const site = siteData.body;

    // 2. Check for missing buses
    for (const busId of EXPECTED_BUSES) {
        if (!health.buses || !health.buses[busId]) {
            issues.push({
                severity: 'CRITICAL',
                source: busId,
                message: `Bus not reporting — no data received`,
                detail: 'Gateway may be offline, disconnected, or misconfigured',
            });
        }
    }

    // 3. Check each reporting bus
    if (health.buses) {
        for (const [busId, bus] of Object.entries(health.buses)) {
            // Stale data
            if (bus.stale) {
                issues.push({
                    severity: 'ERROR',
                    source: busId,
                    message: `Bus data is stale (last seen ${bus.lastSeenAgo})`,
                    detail: `No data for >${STALE_TIMEOUT_S}s — possible network or gateway issue`,
                });
            }

            // Node count check
            const expected = EXPECTED_NODE_COUNTS[busId] || 0;
            if (expected > 0 && bus.nodeCount < expected) {
                const lostPct = ((expected - bus.nodeCount) / expected * 100).toFixed(1);
                const severity = parseFloat(lostPct) > 50 ? 'CRITICAL' : parseFloat(lostPct) > NODE_LOSS_WARN_PCT ? 'ERROR' : 'WARNING';
                issues.push({
                    severity,
                    source: busId,
                    message: `${expected - bus.nodeCount} nodes missing (${bus.nodeCount}/${expected}, -${lostPct}%)`,
                    detail: 'Nodes may be offline, unpowered, or address chain broken',
                });
            }
        }
    }

    // 4. Check individual node data
    if (site.buses) {
        for (const bus of site.buses) {
            if (!bus.nodes) continue;

            for (const node of bus.nodes) {
                const nodeRef = `${bus.busId}/${node.id || 'addr:' + node.addr}`;

                // Sensor health check via status bits
                if (node.status !== undefined) {
                    for (let cam = 0; cam < 4; cam++) {
                        if (!(node.status & (1 << cam))) {
                            issues.push({
                                severity: 'WARNING',
                                source: nodeRef,
                                message: `CAM${cam + 1} fault (status bit ${cam} = 0)`,
                                detail: 'Sensor may be disconnected, I2C failure, or hardware fault',
                            });
                        }
                    }
                }

                // Fill value range checks
                const fillFields = ['cam1Fill', 'cam2Fill', 'cam3Fill', 'cam4Fill', 'avgFill'];
                for (const field of fillFields) {
                    if (node[field] !== undefined) {
                        if (node[field] < FILL_MIN || node[field] > FILL_MAX) {
                            issues.push({
                                severity: 'ERROR',
                                source: nodeRef,
                                message: `${field}=${node[field]} out of range [${FILL_MIN}-${FILL_MAX}]`,
                                detail: 'Invalid sensor reading — possible measurement or transmission error',
                            });
                        }
                    }
                }

                // High variance
                if (node.variance !== undefined && node.variance > VARIANCE_WARN) {
                    issues.push({
                        severity: 'WARNING',
                        source: nodeRef,
                        message: `High variance: ${(node.variance / 10).toFixed(1)}% (threshold: ${VARIANCE_WARN / 10}%)`,
                        detail: 'Uneven fill across cameras — possible sensor misalignment or partial obstruction',
                    });
                }

                // Low confidence
                if (node.confidence !== undefined && node.confidence < CONFIDENCE_WARN) {
                    issues.push({
                        severity: 'WARNING',
                        source: nodeRef,
                        message: `Low confidence: ${node.confidence}% (threshold: ${CONFIDENCE_WARN}%)`,
                        detail: 'Measurement reliability is reduced — check sensor health',
                    });
                }
            }
        }
    }

    // 5. System-level checks
    if (health.totalBuses === EXPECTED_BUSES.length) {
        issues.push({
            severity: 'OK',
            source: 'SYSTEM',
            message: `All ${EXPECTED_BUSES.length} buses reporting`,
        });
    }

    return {
        timestamp,
        issues,
        serverOnline: true,
        busesOnline: health.totalBuses || 0,
        busesExpected: EXPECTED_BUSES.length,
    };
}

/* ── Output Formatting ── */
function formatReport(report) {
    if (outputJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    const criticals = report.issues.filter(i => i.severity === 'CRITICAL');
    const errors = report.issues.filter(i => i.severity === 'ERROR');
    const warnings = report.issues.filter(i => i.severity === 'WARNING');

    console.log();
    console.log(`${C.bold}=== BunkScanner Error Monitor ===${C.reset}  ${report.timestamp}`);
    console.log(`  Server: ${report.serverOnline ? C.green + 'ONLINE' : C.red + 'OFFLINE'}${C.reset}  ` +
                `Buses: ${report.busesOnline || 0}/${report.busesExpected || 7}  ` +
                `Issues: ${C.red}${criticals.length}C${C.reset} ${C.yellow}${errors.length}E${C.reset} ${C.yellow}${warnings.length}W${C.reset}`);

    if (criticals.length === 0 && errors.length === 0 && warnings.length === 0) {
        console.log(`  ${C.green}${C.bold}OK - No issues detected${C.reset}`);
    }

    // Show issues grouped by severity
    for (const issue of [...criticals, ...errors, ...warnings]) {
        const sev = SEV[issue.severity] || SEV.INFO;
        console.log(`  ${sev.color}${sev.label}${C.reset} [${issue.source}] ${issue.message}`);
        if (issue.detail) {
            console.log(`        ${C.dim}-> ${issue.detail}${C.reset}`);
        }
    }

    console.log();
}

/* ── Main Loop ── */
async function main() {
    if (!runOnce) {
        console.log(`${C.bold}BunkScanner Error Monitor${C.reset}`);
        console.log(`  Server: ${SERVER_HOST}:${SERVER_PORT}`);
        console.log(`  Interval: ${pollInterval}s`);
        console.log(`  Press Ctrl+C to stop`);
    }

    const run = async () => {
        const report = await runDiagnostics();
        formatReport(report);

        if (strictMode) {
            const hasErrors = report.issues.some(i => ['CRITICAL', 'ERROR'].includes(i.severity));
            if (hasErrors) process.exit(1);
        }
    };

    await run();

    if (!runOnce) {
        setInterval(run, pollInterval * 1000);
    }
}

main().catch(e => {
    console.error(`${C.red}[FATAL]${C.reset} ${e.message}`);
    process.exit(1);
});
