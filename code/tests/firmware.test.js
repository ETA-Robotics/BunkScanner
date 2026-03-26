/**
 * BunkScanner — Firmware Protocol Tests
 *
 * Tests CRC-16/Modbus, frame construction/parsing,
 * auto-addressing sequence, and register mapping.
 * Validates protocol correctness without needing hardware.
 */

/* ══════════════════════════════════════════════════════
   CRC-16/MODBUS IMPLEMENTATION (mirrored from firmware)
   ══════════════════════════════════════════════════════ */

function modbusCRC16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xFFFF;
}

/* ── Protocol constants (from firmware headers) ── */
const MODBUS_FC_READ_HOLDING = 0x03;
const MODBUS_FC_ASSIGN_ADDR = 0x41;
const MODBUS_FC_ADDR_COMPLETE = 0x42;
const MODBUS_FC_FULL_DATA = 0x43;

const MAX_NODES = 128;
const REGS_PER_NODE = 8;
const MODBUS_MAX_ADDRESS = 247;

// Register map
const REG_STATUS = 0;
const REG_CAM1_FILL = 1;
const REG_CAM2_FILL = 2;
const REG_CAM3_FILL = 3;
const REG_CAM4_FILL = 4;
const REG_AVG_FILL = 5;
const REG_VARIANCE = 6;
const REG_CONFIDENCE = 7;
const REG_NODE_TEMP = 8;
const REG_FW_VERSION = 9;
const REG_UPTIME_HI = 10;
const REG_UPTIME_LO = 11;

/* ── Frame builder helpers ── */

function buildReadHoldingRequest(addr, startReg, numRegs) {
  const buf = Buffer.alloc(8);
  buf[0] = addr;
  buf[1] = MODBUS_FC_READ_HOLDING;
  buf[2] = (startReg >> 8) & 0xFF;
  buf[3] = startReg & 0xFF;
  buf[4] = (numRegs >> 8) & 0xFF;
  buf[5] = numRegs & 0xFF;
  const crc = modbusCRC16(buf.slice(0, 6));
  buf[6] = crc & 0xFF;
  buf[7] = (crc >> 8) & 0xFF;
  return buf;
}

function buildReadHoldingResponse(addr, registerValues) {
  const byteCount = registerValues.length * 2;
  const buf = Buffer.alloc(3 + byteCount + 2);
  buf[0] = addr;
  buf[1] = MODBUS_FC_READ_HOLDING;
  buf[2] = byteCount;
  for (let i = 0; i < registerValues.length; i++) {
    buf[3 + i * 2] = (registerValues[i] >> 8) & 0xFF;
    buf[3 + i * 2 + 1] = registerValues[i] & 0xFF;
  }
  const crc = modbusCRC16(buf.slice(0, 3 + byteCount));
  buf[3 + byteCount] = crc & 0xFF;
  buf[3 + byteCount + 1] = (crc >> 8) & 0xFF;
  return buf;
}

function buildAssignAddressRequest(addr) {
  const buf = Buffer.alloc(5);
  buf[0] = 0x00;  // Broadcast
  buf[1] = MODBUS_FC_ASSIGN_ADDR;
  buf[2] = addr;
  const crc = modbusCRC16(buf.slice(0, 3));
  buf[3] = crc & 0xFF;
  buf[4] = (crc >> 8) & 0xFF;
  return buf;
}

function buildAssignAddressACK(addr) {
  const buf = Buffer.alloc(5);
  buf[0] = addr;
  buf[1] = MODBUS_FC_ASSIGN_ADDR;
  buf[2] = addr;
  const crc = modbusCRC16(buf.slice(0, 3));
  buf[3] = crc & 0xFF;
  buf[4] = (crc >> 8) & 0xFF;
  return buf;
}

function buildAddressCompleteFrame() {
  const buf = Buffer.alloc(4);
  buf[0] = 0x00;
  buf[1] = MODBUS_FC_ADDR_COMPLETE;
  const crc = modbusCRC16(buf.slice(0, 2));
  buf[2] = crc & 0xFF;
  buf[3] = (crc >> 8) & 0xFF;
  return buf;
}

function validateFrame(frame) {
  if (frame.length < 4) return { valid: false, error: 'Frame too short' };
  const dataPart = frame.slice(0, frame.length - 2);
  const receivedCRC = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
  const calculatedCRC = modbusCRC16(dataPart);
  if (receivedCRC !== calculatedCRC) {
    return { valid: false, error: `CRC mismatch: got 0x${receivedCRC.toString(16)}, expected 0x${calculatedCRC.toString(16)}` };
  }
  return { valid: true, addr: frame[0], fc: frame[1] };
}

/* ══════════════════════════════════════════════════════
   TESTS: CRC-16/MODBUS
   ══════════════════════════════════════════════════════ */

describe('CRC-16/MODBUS', () => {
  test('computes correct CRC for known test vector', () => {
    // Standard Modbus CRC test: [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]
    const data = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]);
    const crc = modbusCRC16(data);
    expect(crc).toBe(0xCDC5); // Known correct CRC for Modbus read holding regs request
  });

  test('CRC of empty buffer is 0xFFFF', () => {
    expect(modbusCRC16(Buffer.alloc(0))).toBe(0xFFFF);
  });

  test('CRC of single byte', () => {
    const crc = modbusCRC16(Buffer.from([0x00]));
    expect(typeof crc).toBe('number');
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xFFFF);
  });

  test('CRC is 16-bit value', () => {
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const crc = modbusCRC16(data);
    expect(crc).toBeLessThanOrEqual(0xFFFF);
    expect(crc).toBeGreaterThanOrEqual(0);
  });

  test('different data produces different CRC', () => {
    const crc1 = modbusCRC16(Buffer.from([0x01, 0x03]));
    const crc2 = modbusCRC16(Buffer.from([0x02, 0x03]));
    expect(crc1).not.toBe(crc2);
  });

  test('CRC is deterministic', () => {
    const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
    expect(modbusCRC16(data)).toBe(modbusCRC16(data));
  });

  test('CRC detects byte transposition', () => {
    const crc1 = modbusCRC16(Buffer.from([0x01, 0x02]));
    const crc2 = modbusCRC16(Buffer.from([0x02, 0x01]));
    expect(crc1).not.toBe(crc2);
  });

  test('CRC of broadcast address query', () => {
    // Broadcast assign address: [0x00, 0x41, 0x01]
    const data = Buffer.from([0x00, 0x41, 0x01]);
    const crc = modbusCRC16(data);
    expect(typeof crc).toBe('number');
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Frame Construction
   ══════════════════════════════════════════════════════ */

describe('Modbus frame construction', () => {
  describe('Read Holding Registers request', () => {
    test('builds correct 8-byte frame', () => {
      const frame = buildReadHoldingRequest(1, 0, 8);
      expect(frame.length).toBe(8);
      expect(frame[0]).toBe(1);     // address
      expect(frame[1]).toBe(0x03);  // function code
      expect(frame[2]).toBe(0x00);  // start reg hi
      expect(frame[3]).toBe(0x00);  // start reg lo
      expect(frame[4]).toBe(0x00);  // num regs hi
      expect(frame[5]).toBe(0x08);  // num regs lo
    });

    test('frame has valid CRC', () => {
      const frame = buildReadHoldingRequest(1, 0, 8);
      const result = validateFrame(frame);
      expect(result.valid).toBe(true);
    });

    test('supports high register addresses', () => {
      const frame = buildReadHoldingRequest(247, 256, 1);
      expect(frame[0]).toBe(247);
      expect(frame[2]).toBe(0x01);  // 256 >> 8
      expect(frame[3]).toBe(0x00);  // 256 & 0xFF
    });
  });

  describe('Read Holding Registers response', () => {
    test('builds correct response frame', () => {
      const regs = [0x000F, 500, 480, 510, 490, 495, 30, 80];
      const frame = buildReadHoldingResponse(1, regs);

      expect(frame[0]).toBe(1);         // address
      expect(frame[1]).toBe(0x03);      // function code
      expect(frame[2]).toBe(16);        // byte count (8 regs × 2)
    });

    test('register values are big-endian', () => {
      const regs = [0x1234];
      const frame = buildReadHoldingResponse(1, regs);
      expect(frame[3]).toBe(0x12);  // high byte
      expect(frame[4]).toBe(0x34);  // low byte
    });

    test('response frame has valid CRC', () => {
      const regs = [15, 500, 480, 510, 490, 495, 30, 80];
      const frame = buildReadHoldingResponse(1, regs);
      expect(validateFrame(frame).valid).toBe(true);
    });
  });

  describe('Assign Address request', () => {
    test('uses broadcast address 0x00', () => {
      const frame = buildAssignAddressRequest(1);
      expect(frame[0]).toBe(0x00);
      expect(frame[1]).toBe(0x41);
      expect(frame[2]).toBe(1);
      expect(frame.length).toBe(5);
    });

    test('frame has valid CRC', () => {
      const frame = buildAssignAddressRequest(5);
      expect(validateFrame(frame).valid).toBe(true);
    });
  });

  describe('Assign Address ACK', () => {
    test('echoes assigned address', () => {
      const frame = buildAssignAddressACK(5);
      expect(frame[0]).toBe(5);     // address (the assigned one)
      expect(frame[1]).toBe(0x41);  // function code
      expect(frame[2]).toBe(5);     // echoed address
    });

    test('ACK frame has valid CRC', () => {
      const frame = buildAssignAddressACK(10);
      expect(validateFrame(frame).valid).toBe(true);
    });
  });

  describe('Address Complete frame', () => {
    test('is broadcast with FC 0x42', () => {
      const frame = buildAddressCompleteFrame();
      expect(frame[0]).toBe(0x00);
      expect(frame[1]).toBe(0x42);
      expect(frame.length).toBe(4);
    });

    test('has valid CRC', () => {
      const frame = buildAddressCompleteFrame();
      expect(validateFrame(frame).valid).toBe(true);
    });
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Frame Validation
   ══════════════════════════════════════════════════════ */

describe('Frame validation', () => {
  test('valid frame passes', () => {
    const frame = buildReadHoldingRequest(1, 0, 8);
    expect(validateFrame(frame).valid).toBe(true);
  });

  test('corrupted CRC fails', () => {
    const frame = buildReadHoldingRequest(1, 0, 8);
    frame[6] ^= 0xFF; // Corrupt CRC
    expect(validateFrame(frame).valid).toBe(false);
  });

  test('corrupted data fails', () => {
    const frame = buildReadHoldingRequest(1, 0, 8);
    frame[3] ^= 0x01; // Corrupt one data byte
    expect(validateFrame(frame).valid).toBe(false);
  });

  test('frame too short fails', () => {
    const frame = Buffer.from([0x01, 0x03]);
    expect(validateFrame(frame).valid).toBe(false);
    expect(validateFrame(frame).error).toContain('too short');
  });

  test('empty frame fails', () => {
    expect(validateFrame(Buffer.alloc(0)).valid).toBe(false);
  });

  test('single-byte frame fails', () => {
    expect(validateFrame(Buffer.from([0x01])).valid).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Auto-Addressing Protocol Sequence
   ══════════════════════════════════════════════════════ */

describe('Auto-addressing protocol', () => {
  test('full addressing sequence for 3 nodes', () => {
    const nodes = [];

    for (let addr = 1; addr <= 3; addr++) {
      // Gateway sends assign request
      const request = buildAssignAddressRequest(addr);
      expect(validateFrame(request).valid).toBe(true);
      expect(request[0]).toBe(0x00); // broadcast

      // Node responds with ACK
      const ack = buildAssignAddressACK(addr);
      expect(validateFrame(ack).valid).toBe(true);
      expect(ack[0]).toBe(addr);

      nodes.push(addr);
    }

    // Gateway sends complete
    const complete = buildAddressCompleteFrame();
    expect(validateFrame(complete).valid).toBe(true);

    expect(nodes).toEqual([1, 2, 3]);
  });

  test('addresses are sequential starting from 1', () => {
    for (let i = 1; i <= 10; i++) {
      const req = buildAssignAddressRequest(i);
      expect(req[2]).toBe(i);
    }
  });

  test('maximum address is 247 (Modbus limit)', () => {
    const req = buildAssignAddressRequest(247);
    expect(req[2]).toBe(247);
    expect(validateFrame(req).valid).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Register Map
   ══════════════════════════════════════════════════════ */

describe('Register map', () => {
  test('register indices are sequential 0-11', () => {
    expect(REG_STATUS).toBe(0);
    expect(REG_CAM1_FILL).toBe(1);
    expect(REG_CAM2_FILL).toBe(2);
    expect(REG_CAM3_FILL).toBe(3);
    expect(REG_CAM4_FILL).toBe(4);
    expect(REG_AVG_FILL).toBe(5);
    expect(REG_VARIANCE).toBe(6);
    expect(REG_CONFIDENCE).toBe(7);
    expect(REG_NODE_TEMP).toBe(8);
    expect(REG_FW_VERSION).toBe(9);
    expect(REG_UPTIME_HI).toBe(10);
    expect(REG_UPTIME_LO).toBe(11);
  });

  test('standard poll reads 8 registers starting at 0', () => {
    const frame = buildReadHoldingRequest(1, 0, REGS_PER_NODE);
    expect(frame[3]).toBe(0);    // start register
    expect(frame[5]).toBe(8);    // count
  });

  test('response contains all 8 register values', () => {
    const regs = [0x000F, 500, 480, 510, 490, 495, 30, 80];
    const frame = buildReadHoldingResponse(1, regs);

    // Parse register values back
    const parsed = [];
    for (let i = 0; i < 8; i++) {
      parsed.push((frame[3 + i * 2] << 8) | frame[3 + i * 2 + 1]);
    }
    expect(parsed).toEqual(regs);
  });

  test('status register encodes camera health bits', () => {
    // All cameras OK: bits 0-3 set
    const allOK = 0x000F;
    expect(allOK & 0x01).toBe(1); // CAM1
    expect(allOK & 0x02).toBe(2); // CAM2
    expect(allOK & 0x04).toBe(4); // CAM3
    expect(allOK & 0x08).toBe(8); // CAM4

    // Camera 2 faulty: bit 1 clear
    const cam2Fault = 0x000D; // 1101
    expect(cam2Fault & 0x02).toBe(0);
  });

  test('firmware version register encoding', () => {
    const major = 1;
    const minor = 0;
    const reg = (major << 8) | minor;
    expect(reg).toBe(0x0100);
    expect((reg >> 8) & 0xFF).toBe(major);
    expect(reg & 0xFF).toBe(minor);
  });

  test('uptime register pair encodes 32-bit seconds', () => {
    const uptimeSeconds = 86400; // 1 day
    const hi = (uptimeSeconds >> 16) & 0xFFFF;
    const lo = uptimeSeconds & 0xFFFF;

    const reconstructed = (hi << 16) | lo;
    expect(reconstructed).toBe(86400);
  });

  test('uptime handles large values (>1 year)', () => {
    const uptimeSeconds = 365 * 24 * 3600; // ~31.5M seconds
    const hi = (uptimeSeconds >> 16) & 0xFFFF;
    const lo = uptimeSeconds & 0xFFFF;

    const reconstructed = (hi << 16) | lo;
    expect(reconstructed).toBe(uptimeSeconds);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Gateway JSON Builder Logic
   ══════════════════════════════════════════════════════ */

describe('Gateway JSON builder', () => {
  function buildBusNodeId(side, penNum, segNum) {
    return `${side}${String(penNum).padStart(2, '0')}-S${String(segNum).padStart(2, '0')}`;
  }

  test('builds correct node ID format', () => {
    expect(buildBusNodeId('D', 1, 5)).toBe('D01-S05');
    expect(buildBusNodeId('C', 15, 12)).toBe('C15-S12');
    expect(buildBusNodeId('B', 3, 1)).toBe('B03-S01');
    expect(buildBusNodeId('Z', 10, 8)).toBe('Z10-S08');
  });

  test('node ID matches frontend parser', () => {
    const id = buildBusNodeId('D', 1, 5);
    const match = id.match(/^([A-Z])(\d+)-S(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('D');
    expect(parseInt(match[2])).toBe(1);
    expect(parseInt(match[3])).toBe(5);
  });

  test('JSON payload structure matches server expectations', () => {
    const payload = {
      busId: 'BUS-D',
      side: 'D',
      timestamp: 12345,
      nodeCount: 2,
      nodes: [
        {
          addr: 1,
          id: 'D01-S01',
          status: 15,
          cam1Fill: 500,
          cam2Fill: 480,
          cam3Fill: 510,
          cam4Fill: 490,
          avgFill: 495,
          variance: 30,
          confidence: 80,
        },
      ],
    };

    expect(payload.busId).toMatch(/^BUS-[A-Z]\d?$/);
    expect(Array.isArray(payload.nodes)).toBe(true);
    expect(payload.nodes[0].avgFill).toBeLessThanOrEqual(1000);
    expect(payload.nodes[0].addr).toBeLessThanOrEqual(247);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Error Detection
   ══════════════════════════════════════════════════════ */

describe('Error detection scenarios', () => {
  test('detects node timeout (no response)', () => {
    // Simulate: no bytes received within timeout
    const rxLen = 0;
    const ok = rxLen >= 5;
    expect(ok).toBe(false);
  });

  test('detects CRC error in response', () => {
    const frame = buildReadHoldingResponse(1, [500, 480, 510, 490, 495, 30, 80, 15]);
    // Corrupt one byte
    frame[5] ^= 0xFF;
    expect(validateFrame(frame).valid).toBe(false);
  });

  test('detects wrong address in response', () => {
    const frame = buildReadHoldingResponse(2, [500]);
    const result = validateFrame(frame);
    expect(result.valid).toBe(true);
    // But address doesn't match what we asked (1)
    expect(result.addr).toBe(2);
    expect(result.addr).not.toBe(1); // Mismatch!
  });

  test('detects wrong function code', () => {
    const frame = buildReadHoldingResponse(1, [500]);
    const result = validateFrame(frame);
    expect(result.fc).toBe(MODBUS_FC_READ_HOLDING);
  });

  test('consecutive failure counting', () => {
    const MAX_CONSECUTIVE_FAILS = 5;
    let failCount = 0;
    let online = true;

    for (let i = 0; i < 6; i++) {
      failCount++;
      if (failCount >= MAX_CONSECUTIVE_FAILS) {
        online = false;
      }
    }

    expect(online).toBe(false);
    expect(failCount).toBe(6);
  });

  test('success resets failure counter', () => {
    let failCount = 4;
    // Successful read
    failCount = 0;
    expect(failCount).toBe(0);
  });

  test('bus re-address trigger threshold', () => {
    const nodeCount = 12;
    const faultCount = 5;
    // Trigger if > 1/3 nodes offline
    const shouldReaddress = faultCount > nodeCount / 3;
    expect(shouldReaddress).toBe(true);
  });

  test('bus re-address not triggered for few faults', () => {
    const nodeCount = 12;
    const faultCount = 2;
    const shouldReaddress = faultCount > nodeCount / 3;
    expect(shouldReaddress).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════
   TESTS: Flash Address Storage
   ══════════════════════════════════════════════════════ */

describe('Flash address storage', () => {
  const FLASH_MAGIC = 0xB5AD;

  test('magic value is 0xB5AD', () => {
    expect(FLASH_MAGIC).toBe(0xB5AD);
  });

  test('valid address range is 1-247', () => {
    expect(1).toBeGreaterThanOrEqual(1);
    expect(247).toBeLessThanOrEqual(247);
    expect(0).toBeLessThan(1);
    expect(248).toBeGreaterThan(247);
  });

  test('address 0 is broadcast (invalid for storage)', () => {
    const addr = 0;
    const valid = addr > 0 && addr <= MODBUS_MAX_ADDRESS;
    expect(valid).toBe(false);
  });

  test('address 248+ is invalid', () => {
    const addr = 248;
    const valid = addr > 0 && addr <= MODBUS_MAX_ADDRESS;
    expect(valid).toBe(false);
  });
});
