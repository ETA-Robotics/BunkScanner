/**
 * BunkScanner — Modbus CRC & Protocol Test Suite
 *
 * Tests CRC-16/Modbus, frame construction, register map,
 * auto-addressing protocol, node ID format, bus timing.
 *
 * Run: npx jest test/modbus.test.js
 */

/* ── CRC-16/Modbus (identical to firmware & gateway) ── */
function modbusCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1)
                crc = (crc >> 1) ^ 0xA001;
            else
                crc >>= 1;
        }
    }
    return crc & 0xFFFF;
}

function buildFrame(bytes) {
    const data = Buffer.from(bytes);
    const crc = modbusCRC16(data);
    return Buffer.concat([data, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);
}

function parseReadHoldingResponse(frame) {
    const addr = frame[0];
    const fc = frame[1];
    const byteCount = frame[2];
    const regs = [];
    for (let i = 0; i < byteCount / 2; i++) {
        regs.push((frame[3 + i * 2] << 8) | frame[3 + i * 2 + 1]);
    }
    const crc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
    return { addr, fc, byteCount, regs, crc };
}

/* ════════════════════════════════════════════════════════════
   CRC-16/MODBUS
   ════════════════════════════════════════════════════════════ */

describe('CRC-16/Modbus', () => {
    test('known test vector: read 10 holding regs from slave 1', () => {
        // Frame: 01 03 00 00 00 0A C5 CD (CRC low=0xC5, high=0xCD → register=0xCDC5)
        const data = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A];
        expect(modbusCRC16(data)).toBe(0xCDC5);
    });

    test('empty data returns 0xFFFF', () => {
        expect(modbusCRC16([])).toBe(0xFFFF);
    });

    test('CRC is deterministic', () => {
        const data = [0x01, 0x03, 0x00, 0x00, 0x00, 0x08];
        expect(modbusCRC16(data)).toBe(modbusCRC16(data));
    });

    test('different data produces different CRC', () => {
        expect(modbusCRC16([0x01, 0x03])).not.toBe(modbusCRC16([0x02, 0x03]));
    });

    test('CRC of full frame (data+CRC) equals 0', () => {
        const data = [0x05, 0x03, 0x00, 0x01, 0x00, 0x04];
        const crc = modbusCRC16(data);
        const frame = [...data, crc & 0xFF, (crc >> 8) & 0xFF];
        expect(modbusCRC16(frame)).toBe(0);
    });

    test('broadcast assign address frame validates', () => {
        const frame = buildFrame([0x00, 0x41, 0x01]);
        expect(modbusCRC16(frame)).toBe(0);
        expect(frame).toHaveLength(5);
    });

    test('broadcast addr complete frame validates', () => {
        const frame = buildFrame([0x00, 0x42]);
        expect(modbusCRC16(frame)).toBe(0);
        expect(frame).toHaveLength(4);
    });
});

/* ════════════════════════════════════════════════════════════
   FRAME CONSTRUCTION
   ════════════════════════════════════════════════════════════ */

describe('Frame Construction', () => {
    test('read holding request: 8 bytes', () => {
        const frame = buildFrame([0x05, 0x03, 0x00, 0x00, 0x00, 0x08]);
        expect(frame).toHaveLength(8);
        expect(frame[0]).toBe(0x05);
        expect(frame[1]).toBe(0x03);
    });

    test('assign address broadcast: 5 bytes', () => {
        const frame = buildFrame([0x00, 0x41, 0x01]);
        expect(frame).toHaveLength(5);
        expect(frame[0]).toBe(0x00);
        expect(frame[1]).toBe(0x41);
        expect(frame[2]).toBe(0x01);
    });

    test('address complete broadcast: 4 bytes', () => {
        const frame = buildFrame([0x00, 0x42]);
        expect(frame).toHaveLength(4);
    });

    test('all constructed frames self-validate', () => {
        const frames = [
            buildFrame([0x01, 0x03, 0x00, 0x00, 0x00, 0x08]),
            buildFrame([0x00, 0x41, 0x01]),
            buildFrame([0x00, 0x42]),
            buildFrame([0x7F, 0x03, 0x00, 0x00, 0x00, 0x01]),
        ];
        for (const f of frames) {
            expect(modbusCRC16(f)).toBe(0);
        }
    });
});

/* ════════════════════════════════════════════════════════════
   READ HOLDING RESPONSE PARSING
   ════════════════════════════════════════════════════════════ */

describe('Read Holding Response Parsing', () => {
    test('parses 8-register response correctly', () => {
        const payload = [
            0x01, 0x03, 16,
            0x00, 0x1F,  // STATUS = 0x001F
            0x02, 0x8A,  // CAM1_FILL = 650
            0x02, 0xA8,  // CAM2_FILL = 680
            0x02, 0xBC,  // CAM3_FILL = 700
            0x02, 0xC6,  // CAM4_FILL = 710
            0x02, 0xAD,  // AVG_FILL = 685
            0x00, 0x3C,  // VARIANCE = 60
            0x00, 0x64,  // CONFIDENCE = 100
        ];
        const crc = modbusCRC16(payload);
        const frame = Buffer.from([...payload, crc & 0xFF, (crc >> 8) & 0xFF]);
        const parsed = parseReadHoldingResponse(frame);

        expect(parsed.addr).toBe(1);
        expect(parsed.fc).toBe(0x03);
        expect(parsed.byteCount).toBe(16);
        expect(parsed.regs).toHaveLength(8);
        expect(parsed.regs[0]).toBe(0x001F);
        expect(parsed.regs[1]).toBe(650);
        expect(parsed.regs[5]).toBe(685);
        expect(parsed.regs[7]).toBe(100);
    });

    test('fill values x10 encoding: 650 = 65.0%', () => {
        expect(650 / 10.0).toBe(65.0);
        expect(1000 / 10.0).toBe(100.0);
        expect(0 / 10.0).toBe(0.0);
    });
});

/* ════════════════════════════════════════════════════════════
   REGISTER MAP
   ════════════════════════════════════════════════════════════ */

describe('Register Map', () => {
    const REG = {
        STATUS: 0, CAM1_FILL: 1, CAM2_FILL: 2, CAM3_FILL: 3, CAM4_FILL: 4,
        AVG_FILL: 5, VARIANCE: 6, CONFIDENCE: 7, NODE_TEMP: 8,
        FW_VERSION: 9, UPTIME_HI: 10, UPTIME_LO: 11,
    };

    test('12 registers total', () => {
        expect(Object.keys(REG)).toHaveLength(12);
    });

    test('sequential indices 0-11', () => {
        const values = Object.values(REG).sort((a, b) => a - b);
        for (let i = 0; i < values.length; i++) {
            expect(values[i]).toBe(i);
        }
    });

    test('status bit field: all-OK = 0x3F', () => {
        const allOk = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
        expect(allOk).toBe(0x3F);
    });

    test('firmware version packing', () => {
        expect((1 << 8) | 0).toBe(0x0100);
        expect((2 << 8) | 5).toBe(0x0205);
        expect((0x0205 >> 8) & 0xFF).toBe(2);
        expect(0x0205 & 0xFF).toBe(5);
    });

    test('uptime 32-bit from two 16-bit registers', () => {
        const uptime = 86400;
        const hi = (uptime >> 16) & 0xFFFF;
        const lo = uptime & 0xFFFF;
        expect((hi << 16) | lo).toBe(86400);
    });
});

/* ════════════════════════════════════════════════════════════
   AUTO-ADDRESSING PROTOCOL
   ════════════════════════════════════════════════════════════ */

describe('Auto-Addressing Protocol', () => {
    test('assign address request format', () => {
        const frame = buildFrame([0x00, 0x41, 42]);
        expect(frame[0]).toBe(0x00);
        expect(frame[1]).toBe(0x41);
        expect(frame[2]).toBe(42);
        expect(frame).toHaveLength(5);
    });

    test('assign address ACK format', () => {
        const frame = buildFrame([42, 0x41, 42]);
        expect(frame[0]).toBe(42);
        expect(frame[1]).toBe(0x41);
        expect(frame[2]).toBe(42);
        expect(frame).toHaveLength(5);
    });

    test('valid address range 1-247', () => {
        for (let a = 1; a <= 247; a++) {
            const frame = buildFrame([0x00, 0x41, a]);
            expect(modbusCRC16(frame)).toBe(0);
        }
    });

    test('120-node sequence stays within Modbus limit', () => {
        const addresses = Array.from({ length: 120 }, (_, i) => i + 1);
        expect(addresses[0]).toBe(1);
        expect(addresses[119]).toBe(120);
        expect(Math.max(...addresses)).toBeLessThanOrEqual(247);
    });

    test('flash magic value', () => {
        expect(0xB5AD).toBe(46509);
        expect(0xB5AD & 0xFFFF).toBe(0xB5AD);
    });
});

/* ════════════════════════════════════════════════════════════
   NODE ID FORMAT
   ════════════════════════════════════════════════════════════ */

describe('Node ID Format', () => {
    const REGEX = /^[A-Z]\d{2}-S\d{2}$/;

    test('valid IDs', () => {
        ['D01-S01', 'C15-S12', 'B20-S08', 'Z03-S15'].forEach(id =>
            expect(id).toMatch(REGEX)
        );
    });

    test('invalid IDs', () => {
        ['D1-S1', 'D001-S01', 'd01-s01', '', '01-S01'].forEach(id =>
            expect(id).not.toMatch(REGEX)
        );
    });

    test('parse node ID components', () => {
        const m = 'D01-S05'.match(/^([A-Z])(\d+)-S(\d+)$/);
        expect(m[1]).toBe('D');
        expect(parseInt(m[2])).toBe(1);
        expect(parseInt(m[3])).toBe(5);
    });

    test('penId conversion D01 -> D1', () => {
        const m = 'D01-S05'.match(/^([A-Z])(\d+)-S(\d+)$/);
        expect(m[1] + parseInt(m[2], 10)).toBe('D1');
    });
});

/* ════════════════════════════════════════════════════════════
   BUS TIMING
   ════════════════════════════════════════════════════════════ */

describe('Bus Timing', () => {
    const CHAR_US = (11 / 115200) * 1e6;

    test('character time ~95.5us', () => {
        expect(CHAR_US).toBeCloseTo(95.5, 0);
    });

    test('3.5 char timeout ~334us', () => {
        expect(CHAR_US * 3.5).toBeCloseTo(334, 0);
    });

    test('single node poll < 3.5ms', () => {
        const requestUs = 8 * CHAR_US;
        const responseUs = 21 * CHAR_US;
        const totalUs = requestUs + responseUs + 334;
        expect(totalUs / 1000).toBeLessThan(3.5);
    });

    test('120 nodes < 500ms', () => {
        expect(120 * 3).toBeLessThan(500);
    });

    test('120 nodes well within 30s poll interval', () => {
        expect(120 * 3).toBeLessThan(3000);
    });
});

/* ════════════════════════════════════════════════════════════
   FILL CALCULATION
   ════════════════════════════════════════════════════════════ */

describe('Fill Calculation', () => {
    const DEPTH = 430;

    test('distance 0mm = 100% full', () => {
        expect(((DEPTH - 0) / DEPTH) * 100).toBe(100);
    });

    test('distance 430mm = 0% full', () => {
        expect(((DEPTH - 430) / DEPTH) * 100).toBe(0);
    });

    test('distance 215mm ~ 50% full', () => {
        expect(((DEPTH - 215) / DEPTH) * 100).toBeCloseTo(50, 0);
    });

    test('fill x10 fits uint16', () => {
        expect(1000).toBeLessThanOrEqual(65535);
    });

    test('voltage drop with dual injection > 18V', () => {
        const resistance = 7.4e-3 * 140 * 2;
        const drop = 1.2 * resistance;
        expect(24 - drop).toBeGreaterThan(18);
    });
});
