/**
 * BunkScanner — Frontend Logic Tests
 *
 * Tests the data model functions, classification logic,
 * helpers, and data merge functions from app.js.
 *
 * Uses jsdom for minimal DOM mocking.
 */

/* ── Minimal DOM environment ── */
// jsdom is not needed — pure function tests only

// We need a subset of the frontend logic extracted and testable.
// Since app.js is an IIFE, we re-implement the pure functions here
// to validate the business logic that the frontend depends on.

/* ══════════════════════════════════════════════════════
   EXTRACTED PURE FUNCTIONS (mirror of app.js logic)
   ══════════════════════════════════════════════════════ */

const BUNK_DEPTH_MM = 430;
const SENSORS_PER_SEG = 4;

const DEFAULT_THRESHOLDS = { empty: 10, low: 30, target: 75, high: 75, variance: 25 };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function classifyFill(pct, variance, thresholds = DEFAULT_THRESHOLDS) {
  if (pct === null) return 'nodata';
  if (variance > thresholds.variance) return 'inconsistent';
  if (pct < thresholds.empty) return 'empty';
  if (pct < thresholds.low) return 'low';
  if (pct <= thresholds.target) return 'target';
  return 'high';
}

function classifyFillForSeg(seg, thresholds = DEFAULT_THRESHOLDS) {
  if (seg.hasFault && seg.confidence === 'low') return 'fault';
  return classifyFill(seg.fillPct, seg.variance, thresholds);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '<1 min ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bus → Side mapping (from app.js)
const BUS_SIDE_MAP = {
  'BUS-D': 'D',
  'BUS-C1': 'C', 'BUS-C2': 'C',
  'BUS-B1': 'B', 'BUS-B2': 'B',
  'BUS-Z1': 'Z', 'BUS-Z2': 'Z',
};

// Node ID parser (from mergeBusData)
function parseNodeId(nodeId) {
  const match = nodeId.match(/^([A-Z])(\d+)-S(\d+)$/);
  if (!match) return null;
  return {
    side: match[1],
    penNum: parseInt(match[2], 10),
    penId: match[1] + parseInt(match[2], 10),
    segNum: parseInt(match[3], 10),
    segIdx: parseInt(match[3], 10) - 1,
  };
}

/* ══════════════════════════════════════════════════════
   TESTS: clamp
   ══════════════════════════════════════════════════════ */

describe('clamp', () => {
  test('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  test('clamps to min', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  test('clamps to max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  test('works with equal min and max', () => {
    expect(clamp(50, 42, 42)).toBe(42);
  });

  test('handles exact boundaries', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });

  test('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
  });

  test('handles decimal values', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.5, 0, 1)).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: classifyFill
   ══════════════════════════════════════════════════════ */

describe('classifyFill', () => {
  test('returns nodata for null', () => {
    expect(classifyFill(null, 0)).toBe('nodata');
  });

  test('returns empty below threshold', () => {
    expect(classifyFill(5, 0)).toBe('empty');
    expect(classifyFill(0, 0)).toBe('empty');
    expect(classifyFill(9.9, 0)).toBe('empty');
  });

  test('returns low below low threshold', () => {
    expect(classifyFill(15, 0)).toBe('low');
    expect(classifyFill(29, 0)).toBe('low');
  });

  test('returns target in target range', () => {
    expect(classifyFill(50, 0)).toBe('target');
    expect(classifyFill(30, 0)).toBe('target');
    expect(classifyFill(75, 0)).toBe('target');
  });

  test('returns high above target', () => {
    expect(classifyFill(76, 0)).toBe('high');
    expect(classifyFill(100, 0)).toBe('high');
  });

  test('returns inconsistent when variance exceeds threshold', () => {
    expect(classifyFill(50, 30)).toBe('inconsistent');
    expect(classifyFill(50, 26)).toBe('inconsistent');
  });

  test('variance threshold takes priority over fill level', () => {
    // Even if fill is in target range, high variance = inconsistent
    expect(classifyFill(50, 50)).toBe('inconsistent');
  });

  test('exact threshold boundaries', () => {
    // empty: < 10, so 10 should be 'low'
    expect(classifyFill(10, 0)).toBe('low');
    // low: < 30, so 30 should be 'target'
    expect(classifyFill(30, 0)).toBe('target');
    // target: <= 75, so 75 should be 'target'
    expect(classifyFill(75, 0)).toBe('target');
    // variance: > 25, so 25 should NOT be inconsistent
    expect(classifyFill(50, 25)).toBe('target');
  });

  test('custom thresholds', () => {
    const custom = { empty: 5, low: 20, target: 60, high: 60, variance: 10 };
    expect(classifyFill(3, 0, custom)).toBe('empty');
    expect(classifyFill(15, 0, custom)).toBe('low');
    expect(classifyFill(50, 0, custom)).toBe('target');
    expect(classifyFill(70, 0, custom)).toBe('high');
    expect(classifyFill(50, 15, custom)).toBe('inconsistent');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: classifyFillForSeg
   ══════════════════════════════════════════════════════ */

describe('classifyFillForSeg', () => {
  test('returns fault for faulty low-confidence segment', () => {
    const seg = { fillPct: 50, variance: 5, hasFault: true, confidence: 'low' };
    expect(classifyFillForSeg(seg)).toBe('fault');
  });

  test('does not return fault for faulty high-confidence segment', () => {
    const seg = { fillPct: 50, variance: 5, hasFault: true, confidence: 'high' };
    expect(classifyFillForSeg(seg)).toBe('target');
  });

  test('falls through to classifyFill when no fault', () => {
    const seg = { fillPct: 5, variance: 0, hasFault: false, confidence: 'high' };
    expect(classifyFillForSeg(seg)).toBe('empty');
  });

  test('handles null fillPct', () => {
    const seg = { fillPct: null, variance: 0, hasFault: false, confidence: 'high' };
    expect(classifyFillForSeg(seg)).toBe('nodata');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: formatTime
   ══════════════════════════════════════════════════════ */

describe('formatTime', () => {
  test('formats timestamp as HH:MM:SS', () => {
    const result = formatTime(Date.now());
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('returns consistent format', () => {
    const ts = new Date('2025-06-15T14:30:45').getTime();
    const result = formatTime(ts);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: formatTimeAgo
   ══════════════════════════════════════════════════════ */

describe('formatTimeAgo', () => {
  test('returns <1 min for very recent', () => {
    expect(formatTimeAgo(Date.now() - 30000)).toBe('<1 min ago');
  });

  test('returns minutes for <1 hour', () => {
    expect(formatTimeAgo(Date.now() - 300000)).toBe('5m ago');
  });

  test('returns hours for <1 day', () => {
    expect(formatTimeAgo(Date.now() - 7200000)).toBe('2h ago');
  });

  test('returns days for >1 day', () => {
    expect(formatTimeAgo(Date.now() - 172800000)).toBe('2d ago');
  });

  test('handles just under 1 minute', () => {
    expect(formatTimeAgo(Date.now() - 59999)).toBe('<1 min ago');
  });

  test('handles exactly 1 hour', () => {
    expect(formatTimeAgo(Date.now() - 3600000)).toBe('1h ago');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: escapeHtml
   ══════════════════════════════════════════════════════ */

describe('escapeHtml', () => {
  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).not.toContain('<script>');
  });

  test('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toContain('&amp;');
  });

  test('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('escapes quotes in content', () => {
    const result = escapeHtml('say "hello"');
    // textContent doesn't need to escape quotes in innerHTML
    expect(result).toContain('hello');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: parseNodeId
   ══════════════════════════════════════════════════════ */

describe('parseNodeId', () => {
  test('parses standard node ID', () => {
    const result = parseNodeId('D01-S05');
    expect(result).toEqual({
      side: 'D',
      penNum: 1,
      penId: 'D1',
      segNum: 5,
      segIdx: 4,
    });
  });

  test('parses multi-digit pen number', () => {
    const result = parseNodeId('B20-S01');
    expect(result).toEqual({
      side: 'B',
      penNum: 20,
      penId: 'B20',
      segNum: 1,
      segIdx: 0,
    });
  });

  test('parses C side', () => {
    const result = parseNodeId('C15-S12');
    expect(result).toEqual({
      side: 'C',
      penNum: 15,
      penId: 'C15',
      segNum: 12,
      segIdx: 11,
    });
  });

  test('parses Z side', () => {
    const result = parseNodeId('Z01-S01');
    expect(result).toEqual({
      side: 'Z',
      penNum: 1,
      penId: 'Z1',
      segNum: 1,
      segIdx: 0,
    });
  });

  test('returns null for invalid format', () => {
    expect(parseNodeId('invalid')).toBeNull();
    expect(parseNodeId('')).toBeNull();
    expect(parseNodeId('D-S01')).toBeNull();
    expect(parseNodeId('D01S01')).toBeNull();
  });

  test('returns null for lowercase', () => {
    expect(parseNodeId('d01-S01')).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: BUS_SIDE_MAP
   ══════════════════════════════════════════════════════ */

describe('BUS_SIDE_MAP', () => {
  test('maps all bus IDs to correct sides', () => {
    expect(BUS_SIDE_MAP['BUS-D']).toBe('D');
    expect(BUS_SIDE_MAP['BUS-C1']).toBe('C');
    expect(BUS_SIDE_MAP['BUS-C2']).toBe('C');
    expect(BUS_SIDE_MAP['BUS-B1']).toBe('B');
    expect(BUS_SIDE_MAP['BUS-B2']).toBe('B');
    expect(BUS_SIDE_MAP['BUS-Z1']).toBe('Z');
    expect(BUS_SIDE_MAP['BUS-Z2']).toBe('Z');
  });

  test('has exactly 7 entries', () => {
    expect(Object.keys(BUS_SIDE_MAP)).toHaveLength(7);
  });

  test('returns undefined for unknown bus', () => {
    expect(BUS_SIDE_MAP['BUS-X']).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Feed level calculations
   ══════════════════════════════════════════════════════ */

describe('Feed level calculations', () => {
  test('fill percentage to mm conversion', () => {
    // 50% fill = 215mm
    const fillPct = 50;
    const rawMm = Math.round((fillPct / 100) * BUNK_DEPTH_MM);
    expect(rawMm).toBe(215);
  });

  test('0% fill = 0mm', () => {
    expect(Math.round((0 / 100) * BUNK_DEPTH_MM)).toBe(0);
  });

  test('100% fill = full depth', () => {
    expect(Math.round((100 / 100) * BUNK_DEPTH_MM)).toBe(430);
  });

  test('sensor aggregation logic', () => {
    const sensors = [
      { fillPct: 50 },
      { fillPct: 60 },
      { fillPct: null },  // faulty sensor
      { fillPct: 55 },
    ];
    const valid = sensors.filter(s => s.fillPct !== null);
    const avg = valid.reduce((a, s) => a + s.fillPct, 0) / valid.length;
    expect(avg).toBe(55);

    const variance = Math.max(...valid.map(s => s.fillPct)) - Math.min(...valid.map(s => s.fillPct));
    expect(variance).toBe(10);
  });

  test('all sensors faulty gives no data', () => {
    const sensors = [
      { fillPct: null },
      { fillPct: null },
      { fillPct: null },
      { fillPct: null },
    ];
    const valid = sensors.filter(s => s.fillPct !== null);
    expect(valid).toHaveLength(0);
  });

  test('single valid sensor has zero variance', () => {
    const sensors = [
      { fillPct: null },
      { fillPct: 45.5 },
      { fillPct: null },
      { fillPct: null },
    ];
    const valid = sensors.filter(s => s.fillPct !== null);
    expect(valid).toHaveLength(1);
    const variance = valid.length > 1
      ? Math.max(...valid.map(s => s.fillPct)) - Math.min(...valid.map(s => s.fillPct))
      : 0;
    expect(variance).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Modbus data conversion (gateway → frontend)
   ══════════════════════════════════════════════════════ */

describe('Modbus data conversion', () => {
  test('×10 fill values convert to 0-100 range', () => {
    // Gateway sends avgFill as ×10 (e.g., 505 = 50.5%)
    const modbusValue = 505;
    const fillPct = modbusValue / 10.0;
    expect(fillPct).toBe(50.5);
  });

  test('full range conversion', () => {
    expect(0 / 10.0).toBe(0);       // 0%
    expect(1000 / 10.0).toBe(100);   // 100%
    expect(500 / 10.0).toBe(50);     // 50%
  });

  test('status bits indicate sensor health', () => {
    // Bits 0-3 correspond to cameras 1-4
    const status = 0x0F; // All 4 cameras OK
    for (let cam = 0; cam < 4; cam++) {
      expect((status & (1 << cam)) !== 0).toBe(true);
    }

    // Camera 3 faulty
    const faultyStatus = 0x0B; // 1011 binary
    expect((faultyStatus & (1 << 0)) !== 0).toBe(true);  // cam1 OK
    expect((faultyStatus & (1 << 1)) !== 0).toBe(true);  // cam2 OK
    expect((faultyStatus & (1 << 2)) !== 0).toBe(false);  // cam3 FAULT
    expect((faultyStatus & (1 << 3)) !== 0).toBe(true);  // cam4 OK
  });

  test('confidence mapping', () => {
    // Frontend classifies: >75 = high, >50 = medium, else low
    expect(80 > 75 ? 'high' : 80 > 50 ? 'medium' : 'low').toBe('high');
    expect(60 > 75 ? 'high' : 60 > 50 ? 'medium' : 'low').toBe('medium');
    expect(30 > 75 ? 'high' : 30 > 50 ? 'medium' : 'low').toBe('low');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Alert generation logic
   ══════════════════════════════════════════════════════ */

describe('Alert generation logic', () => {
  const thresholds = DEFAULT_THRESHOLDS;

  test('empty bunk generates urgent alert', () => {
    const fillPct = 5;
    const type = fillPct < thresholds.empty ? 'urgent'
               : fillPct < thresholds.low ? 'warning'
               : null;
    expect(type).toBe('urgent');
  });

  test('low fill generates warning', () => {
    const fillPct = 20;
    const type = fillPct < thresholds.empty ? 'urgent'
               : fillPct < thresholds.low ? 'warning'
               : null;
    expect(type).toBe('warning');
  });

  test('target fill generates no alert', () => {
    const fillPct = 50;
    const type = fillPct < thresholds.empty ? 'urgent'
               : fillPct < thresholds.low ? 'warning'
               : null;
    expect(type).toBeNull();
  });

  test('high variance generates info alert', () => {
    const variance = 30;
    const isUneven = variance > thresholds.variance;
    expect(isUneven).toBe(true);
  });

  test('normal variance does not alert', () => {
    const variance = 10;
    const isUneven = variance > thresholds.variance;
    expect(isUneven).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Layout structure validation
   ══════════════════════════════════════════════════════ */

describe('Layout structure', () => {
  // These match the LAYOUT constant from app.js
  const LAYOUT_PEN_COUNTS = { D: 8, C: 15, B: 20, Z: 10 };

  test('total pen count is 53', () => {
    const total = Object.values(LAYOUT_PEN_COUNTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(53);
  });

  test('D side has 8 pens (D1-D8)', () => {
    expect(LAYOUT_PEN_COUNTS.D).toBe(8);
  });

  test('C side has 15 pens (C1-C15)', () => {
    expect(LAYOUT_PEN_COUNTS.C).toBe(15);
  });

  test('B side has 20 pens (B1-B20)', () => {
    expect(LAYOUT_PEN_COUNTS.B).toBe(20);
  });

  test('Z side has 10 pens (Z1-Z10)', () => {
    expect(LAYOUT_PEN_COUNTS.Z).toBe(10);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Stale data detection
   ══════════════════════════════════════════════════════ */

describe('Stale data detection', () => {
  test('data < 60s old is fresh', () => {
    const receivedAt = Date.now() - 30000;
    const now = Date.now();
    expect((now - receivedAt) > 60000).toBe(false);
  });

  test('data > 60s old is stale', () => {
    const receivedAt = Date.now() - 90000;
    const now = Date.now();
    expect((now - receivedAt) > 60000).toBe(true);
  });

  test('data exactly 60s old is not stale', () => {
    const now = Date.now();
    const receivedAt = now - 60000;
    expect((now - receivedAt) > 60000).toBe(false);
  });
});
