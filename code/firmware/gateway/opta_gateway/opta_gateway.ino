/**
 * BunkScanner Gateway — Arduino Opta
 *
 * RS485 bus master that:
 * 1. Runs daisy-chain auto-addressing on boot
 * 2. Polls all addressed nodes via Modbus RTU (registers 0–7)
 * 3. Pushes aggregated JSON data to web server via Ethernet
 * 4. Reports bus health and handles re-addressing
 *
 * Hardware: Arduino Opta (built-in RS485 + Ethernet)
 * Protocol: Modbus RTU at 115200 baud
 */

#include <ArduinoRS485.h>
#include <Ethernet.h>
#include <ArduinoJson.h>

/* ════════════════════════════════════════════════════════════
   CONFIGURATION — Edit per gateway
   ════════════════════════════════════════════════════════════ */

// Bus identity — set uniquely per Opta unit
const char* BUS_ID    = "BUS-D";   // BUS-D, BUS-C1, BUS-C2, BUS-B1, BUS-B2, BUS-Z1, BUS-Z2
const char* SIDE      = "D";       // D, C, C, B, B, Z, Z
const int   PEN_START = 1;         // First pen number on this bus
const int   PEN_END   = 8;         // Last pen number on this bus

// Network
byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01 }; // Unique per Opta
IPAddress serverIP(192, 168, 1, 100);
const int  serverPort = 3000;
const char* apiPath   = "/api/bus/data";

// Timing
const unsigned long POLL_INTERVAL_MS       = 5000;   // Poll all nodes every 5s
const unsigned long MODBUS_TIMEOUT_MS      = 50;     // Response timeout per node
const unsigned long MODBUS_INTER_FRAME_MS  = 5;      // Silence between frames
const unsigned long ADDRESSING_TIMEOUT_MS  = 100;    // Wait for address ACK
const unsigned long HEALTH_REPORT_MS       = 30000;  // Report bus health every 30s
const int           MAX_CONSECUTIVE_FAILS  = 5;      // Trigger re-address after N failures

/* ════════════════════════════════════════════════════════════
   MODBUS PROTOCOL CONSTANTS
   ════════════════════════════════════════════════════════════ */

#define MODBUS_FC_READ_HOLDING   0x03
#define MODBUS_FC_ASSIGN_ADDR    0x41
#define MODBUS_FC_ADDR_COMPLETE  0x42
#define MODBUS_FC_FULL_DATA      0x43

#define MAX_NODES                128
#define REGS_PER_NODE            8

// Register indices
#define REG_STATUS      0
#define REG_CAM1_FILL   1
#define REG_CAM2_FILL   2
#define REG_CAM3_FILL   3
#define REG_CAM4_FILL   4
#define REG_AVG_FILL    5
#define REG_VARIANCE    6
#define REG_CONFIDENCE  7

/* ════════════════════════════════════════════════════════════
   NODE DATA STRUCTURE
   ════════════════════════════════════════════════════════════ */

struct NodeData {
    uint8_t  address;
    uint16_t registers[REGS_PER_NODE];
    bool     online;
    uint8_t  failCount;
    unsigned long lastSeen;
};

NodeData nodes[MAX_NODES];
int nodeCount = 0;
bool addressingDone = false;

// CRC buffer
uint8_t txBuf[32];
uint8_t rxBuf[64];

// Ethernet client
EthernetClient client;

// Timing
unsigned long lastPoll = 0;
unsigned long lastHealthReport = 0;

/* ════════════════════════════════════════════════════════════
   CRC-16/MODBUS
   ════════════════════════════════════════════════════════════ */

uint16_t modbusCRC16(const uint8_t* data, uint16_t len) {
    uint16_t crc = 0xFFFF;
    for (uint16_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 1)
                crc = (crc >> 1) ^ 0xA001;
            else
                crc >>= 1;
        }
    }
    return crc;
}

/* ════════════════════════════════════════════════════════════
   RS485 RAW SEND/RECEIVE
   ════════════════════════════════════════════════════════════ */

void rs485Send(const uint8_t* data, int len) {
    RS485.beginTransmission();
    RS485.write(data, len);
    RS485.endTransmission();
}

int rs485Receive(uint8_t* buf, int maxLen, unsigned long timeoutMs) {
    unsigned long start = millis();
    int idx = 0;
    unsigned long lastByte = 0;

    while (millis() - start < timeoutMs) {
        if (RS485.available()) {
            if (idx < maxLen) {
                buf[idx++] = RS485.read();
                lastByte = millis();
            }
        } else if (idx > 0 && millis() - lastByte > MODBUS_INTER_FRAME_MS) {
            break; // Inter-frame silence detected
        }
    }
    return idx;
}

/* ════════════════════════════════════════════════════════════
   MODBUS MASTER — READ HOLDING REGISTERS
   ════════════════════════════════════════════════════════════ */

bool modbusReadHolding(uint8_t addr, uint16_t startReg, uint16_t numRegs,
                        uint16_t* outRegs) {
    // Build request: [addr, FC, startHi, startLo, numHi, numLo, CRClo, CRChi]
    txBuf[0] = addr;
    txBuf[1] = MODBUS_FC_READ_HOLDING;
    txBuf[2] = (startReg >> 8) & 0xFF;
    txBuf[3] = startReg & 0xFF;
    txBuf[4] = (numRegs >> 8) & 0xFF;
    txBuf[5] = numRegs & 0xFF;
    uint16_t crc = modbusCRC16(txBuf, 6);
    txBuf[6] = crc & 0xFF;
    txBuf[7] = (crc >> 8) & 0xFF;

    rs485Send(txBuf, 8);
    delay(MODBUS_INTER_FRAME_MS);

    int rxLen = rs485Receive(rxBuf, sizeof(rxBuf), MODBUS_TIMEOUT_MS);

    // Validate response
    if (rxLen < 5) return false;

    // Check CRC
    uint16_t rxCRC = rxBuf[rxLen - 2] | (rxBuf[rxLen - 1] << 8);
    if (rxCRC != modbusCRC16(rxBuf, rxLen - 2)) return false;

    // Check address and function code
    if (rxBuf[0] != addr || rxBuf[1] != MODBUS_FC_READ_HOLDING) return false;

    // Extract register values
    uint8_t byteCount = rxBuf[2];
    if (byteCount != numRegs * 2) return false;

    for (uint16_t i = 0; i < numRegs; i++) {
        outRegs[i] = (rxBuf[3 + i * 2] << 8) | rxBuf[3 + i * 2 + 1];
    }

    return true;
}

/* ════════════════════════════════════════════════════════════
   AUTO-ADDRESSING — DAISY CHAIN ORCHESTRATION
   ════════════════════════════════════════════════════════════ */

int runAutoAddressing() {
    Serial.println("[ADDR] Starting auto-addressing sequence...");
    nodeCount = 0;

    for (int addr = 1; addr <= MAX_NODES; addr++) {
        // Build ASSIGN_ADDRESS broadcast: [0x00, 0x41, addr, CRClo, CRChi]
        txBuf[0] = 0x00;  // Broadcast
        txBuf[1] = MODBUS_FC_ASSIGN_ADDR;
        txBuf[2] = (uint8_t)addr;
        uint16_t crc = modbusCRC16(txBuf, 3);
        txBuf[3] = crc & 0xFF;
        txBuf[4] = (crc >> 8) & 0xFF;

        rs485Send(txBuf, 5);
        delay(MODBUS_INTER_FRAME_MS);

        // Wait for ACK: [addr, 0x41, addr, CRClo, CRChi]
        int rxLen = rs485Receive(rxBuf, sizeof(rxBuf), ADDRESSING_TIMEOUT_MS);

        if (rxLen < 5) {
            Serial.print("[ADDR] No response at address ");
            Serial.print(addr);
            Serial.println(" — end of chain.");
            break;
        }

        // Validate ACK
        uint16_t rxCRC = rxBuf[rxLen - 2] | (rxBuf[rxLen - 1] << 8);
        if (rxCRC != modbusCRC16(rxBuf, rxLen - 2) ||
            rxBuf[0] != addr || rxBuf[1] != MODBUS_FC_ASSIGN_ADDR ||
            rxBuf[2] != addr) {
            Serial.print("[ADDR] Invalid ACK at address ");
            Serial.println(addr);
            break;
        }

        // Node accepted address
        nodes[nodeCount].address = addr;
        nodes[nodeCount].online = true;
        nodes[nodeCount].failCount = 0;
        nodes[nodeCount].lastSeen = millis();
        memset(nodes[nodeCount].registers, 0, sizeof(nodes[nodeCount].registers));
        nodeCount++;

        Serial.print("[ADDR] Node ");
        Serial.print(addr);
        Serial.println(" addressed OK");

        delay(10); // Small delay for daisy chain propagation
    }

    // Send ADDR_COMPLETE broadcast
    txBuf[0] = 0x00;
    txBuf[1] = MODBUS_FC_ADDR_COMPLETE;
    uint16_t crc = modbusCRC16(txBuf, 2);
    txBuf[2] = crc & 0xFF;
    txBuf[3] = (crc >> 8) & 0xFF;
    rs485Send(txBuf, 4);

    addressingDone = (nodeCount > 0);

    Serial.print("[ADDR] Complete: ");
    Serial.print(nodeCount);
    Serial.println(" nodes addressed.");

    return nodeCount;
}

/* ════════════════════════════════════════════════════════════
   POLL ALL NODES
   ════════════════════════════════════════════════════════════ */

void pollAllNodes() {
    int onlineCount = 0;
    int faultCount = 0;

    for (int i = 0; i < nodeCount; i++) {
        uint16_t regs[REGS_PER_NODE];
        bool ok = modbusReadHolding(nodes[i].address, 0, REGS_PER_NODE, regs);

        if (ok) {
            memcpy(nodes[i].registers, regs, sizeof(regs));
            nodes[i].online = true;
            nodes[i].failCount = 0;
            nodes[i].lastSeen = millis();
            onlineCount++;
        } else {
            nodes[i].failCount++;
            if (nodes[i].failCount >= MAX_CONSECUTIVE_FAILS) {
                nodes[i].online = false;
                faultCount++;
            }
        }

        delay(MODBUS_INTER_FRAME_MS);
    }

    // If too many nodes went offline, trigger re-addressing
    if (faultCount > nodeCount / 3 && nodeCount > 0) {
        Serial.println("[BUS] Too many faults — triggering re-addressing");
        runAutoAddressing();
    }
}

/* ════════════════════════════════════════════════════════════
   JSON DATA BUILDER
   ════════════════════════════════════════════════════════════ */

String buildBusDataJSON() {
    // Calculate buffer size: ~100 bytes per node + overhead
    const size_t capacity = JSON_OBJECT_SIZE(4) +
                            JSON_ARRAY_SIZE(nodeCount) +
                            nodeCount * JSON_OBJECT_SIZE(10);
    DynamicJsonDocument doc(capacity > 16384 ? capacity : 16384);

    doc["busId"] = BUS_ID;
    doc["side"] = SIDE;
    doc["timestamp"] = millis();
    doc["nodeCount"] = nodeCount;

    JsonArray nodesArr = doc.createNestedArray("nodes");

    // Map Modbus address → pen/segment based on position
    int segmentIndex = 0;
    int currentPen = PEN_START;
    int segInPen = 1;

    for (int i = 0; i < nodeCount; i++) {
        if (!nodes[i].online) {
            segmentIndex++;
            segInPen++;
            continue;
        }

        JsonObject n = nodesArr.createNestedObject();
        n["addr"] = nodes[i].address;

        // Build node ID: e.g. "D01-S05"
        char nodeId[12];
        snprintf(nodeId, sizeof(nodeId), "%s%02d-S%02d", SIDE, currentPen, segInPen);
        n["id"] = nodeId;

        n["status"]     = nodes[i].registers[REG_STATUS];
        n["cam1Fill"]   = nodes[i].registers[REG_CAM1_FILL];
        n["cam2Fill"]   = nodes[i].registers[REG_CAM2_FILL];
        n["cam3Fill"]   = nodes[i].registers[REG_CAM3_FILL];
        n["cam4Fill"]   = nodes[i].registers[REG_CAM4_FILL];
        n["avgFill"]    = nodes[i].registers[REG_AVG_FILL];
        n["variance"]   = nodes[i].registers[REG_VARIANCE];
        n["confidence"] = nodes[i].registers[REG_CONFIDENCE];

        segmentIndex++;
        segInPen++;

        /* Pen boundary detection:
         * This is approximate — the exact segment count per pen is
         * configured in the bus mapping table. For now, use the known
         * segments-per-pen from the LAYOUT configuration. The server
         * holds the authoritative pen→segment mapping. */
    }

    String output;
    serializeJson(doc, output);
    return output;
}

/* ════════════════════════════════════════════════════════════
   ETHERNET — POST DATA TO SERVER
   ════════════════════════════════════════════════════════════ */

bool postDataToServer(const String& jsonData) {
    if (client.connect(serverIP, serverPort)) {
        client.print("POST ");
        client.print(apiPath);
        client.println(" HTTP/1.1");
        client.print("Host: ");
        client.print(serverIP);
        client.print(":");
        client.println(serverPort);
        client.println("Content-Type: application/json");
        client.print("Content-Length: ");
        client.println(jsonData.length());
        client.println("Connection: close");
        client.println();
        client.print(jsonData);

        // Read response (non-blocking, just drain)
        unsigned long start = millis();
        while (client.connected() && millis() - start < 2000) {
            while (client.available()) {
                client.read(); // Drain response
            }
        }
        client.stop();
        return true;
    }

    Serial.println("[ETH] Connection to server failed");
    return false;
}

/* ════════════════════════════════════════════════════════════
   BUS HEALTH REPORT
   ════════════════════════════════════════════════════════════ */

void reportBusHealth() {
    int online = 0;
    int offline = 0;
    for (int i = 0; i < nodeCount; i++) {
        if (nodes[i].online) online++;
        else offline++;
    }

    Serial.print("[HEALTH] Bus ");
    Serial.print(BUS_ID);
    Serial.print(": ");
    Serial.print(online);
    Serial.print(" online, ");
    Serial.print(offline);
    Serial.print(" offline, ");
    Serial.print(nodeCount);
    Serial.println(" total");
}

/* ════════════════════════════════════════════════════════════
   SETUP & LOOP
   ════════════════════════════════════════════════════════════ */

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000); // Wait for serial (max 3s)

    Serial.println("==============================");
    Serial.print("BunkScanner Gateway — ");
    Serial.println(BUS_ID);
    Serial.println("==============================");

    // Initialize RS485 at 115200 baud
    RS485.begin(115200);
    RS485.receive();
    Serial.println("[RS485] Initialized at 115200 baud");

    // Initialize Ethernet
    Serial.println("[ETH] Initializing...");
    if (Ethernet.begin(mac) == 0) {
        Serial.println("[ETH] DHCP failed, using fallback IP");
        IPAddress fallbackIP(192, 168, 1, 200);
        Ethernet.begin(mac, fallbackIP);
    }
    Serial.print("[ETH] IP: ");
    Serial.println(Ethernet.localIP());

    // Run auto-addressing
    delay(2000); // Wait for all nodes to boot
    runAutoAddressing();

    // Post initial bus mapping to server
    if (addressingDone) {
        String json = buildBusDataJSON();
        postDataToServer(json);
    }

    lastPoll = millis();
    lastHealthReport = millis();
}

void loop() {
    unsigned long now = millis();

    // Poll all nodes at interval
    if (now - lastPoll >= POLL_INTERVAL_MS && addressingDone) {
        lastPoll = now;
        pollAllNodes();

        // Build and send data
        String json = buildBusDataJSON();
        postDataToServer(json);
    }

    // Periodic health report to serial
    if (now - lastHealthReport >= HEALTH_REPORT_MS) {
        lastHealthReport = now;
        reportBusHealth();
    }

    // Maintain Ethernet
    Ethernet.maintain();
}
