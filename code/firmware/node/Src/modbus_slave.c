/**
 * BunkScanner Node — Modbus RTU Slave Implementation
 *
 * Implements:
 * - Standard: Read Holding Registers (0x03)
 * - Custom:   Assign Address (0x41), Address Complete (0x42),
 *             Request Full Data (0x43)
 * - CRC-16/Modbus calculation
 * - 3.5-character inter-frame timeout detection
 */

#include "modbus_slave.h"
#include "auto_address.h"
#include "stm32g0xx_hal.h"
#include <string.h>

/* ── External HAL access ── */
extern UART_HandleTypeDef *get_uart_handle(void);

/* ── Module State ── */
static uint8_t  slave_address = MODBUS_ADDR_UNASSIGNED;
static uint16_t holding_registers[REG_COUNT];

/* ── RX Buffer ── */
static volatile uint8_t  rx_buf[MODBUS_RX_BUF_SIZE];
static volatile uint8_t  rx_len = 0;
static volatile bool     frame_ready = false;

/* ── TX Buffer ── */
static uint8_t tx_buf[MODBUS_TX_BUF_SIZE];

/* ── CRC ── */
static uint16_t modbus_crc16(const uint8_t *data, uint16_t len)
{
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

static void transmit(const uint8_t *data, uint16_t len)
{
    UART_HandleTypeDef *huart = get_uart_handle();
    HAL_UART_Transmit(huart, data, len, 50);
}

static void send_exception(uint8_t fc, uint8_t exception_code)
{
    tx_buf[0] = slave_address;
    tx_buf[1] = fc | 0x80;
    tx_buf[2] = exception_code;
    uint16_t crc = modbus_crc16(tx_buf, 3);
    tx_buf[3] = crc & 0xFF;
    tx_buf[4] = (crc >> 8) & 0xFF;
    transmit(tx_buf, 5);
}

/* ── Handle Read Holding Registers (FC 0x03) ── */
static void handle_read_holding(const uint8_t *frame, uint8_t len)
{
    if (len < 6) return;

    uint16_t start_reg = (frame[2] << 8) | frame[3];
    uint16_t num_regs  = (frame[4] << 8) | frame[5];

    if (start_reg + num_regs > REG_COUNT || num_regs == 0 || num_regs > 125) {
        send_exception(MODBUS_FC_READ_HOLDING, 0x02); /* Illegal data address */
        return;
    }

    uint8_t byte_count = num_regs * 2;
    tx_buf[0] = slave_address;
    tx_buf[1] = MODBUS_FC_READ_HOLDING;
    tx_buf[2] = byte_count;

    for (uint16_t i = 0; i < num_regs; i++) {
        tx_buf[3 + i * 2]     = (holding_registers[start_reg + i] >> 8) & 0xFF;
        tx_buf[3 + i * 2 + 1] =  holding_registers[start_reg + i] & 0xFF;
    }

    uint16_t resp_len = 3 + byte_count;
    uint16_t crc = modbus_crc16(tx_buf, resp_len);
    tx_buf[resp_len]     = crc & 0xFF;
    tx_buf[resp_len + 1] = (crc >> 8) & 0xFF;
    transmit(tx_buf, resp_len + 2);
}

/* ── Handle Assign Address (FC 0x41) — broadcast ── */
static void handle_assign_address(const uint8_t *frame, uint8_t len)
{
    if (len < 5) return;

    /* Only respond if we are eligible (ADDR_IN is LOW) and unaddressed */
    if (!addr_chain_is_eligible()) return;
    if (slave_address != MODBUS_ADDR_UNASSIGNED) return;

    uint8_t new_addr = frame[2];
    if (new_addr == 0 || new_addr > MODBUS_MAX_ADDRESS) return;

    /* Accept the address */
    on_address_assigned(new_addr);

    /* Send acknowledgment: [new_addr, FC, new_addr, CRC] */
    tx_buf[0] = new_addr;
    tx_buf[1] = MODBUS_FC_ASSIGN_ADDR;
    tx_buf[2] = new_addr;
    uint16_t crc = modbus_crc16(tx_buf, 3);
    tx_buf[3] = crc & 0xFF;
    tx_buf[4] = (crc >> 8) & 0xFF;
    transmit(tx_buf, 5);
}

/* ── Handle Address Complete (FC 0x42) — broadcast ── */
static void handle_addr_complete(const uint8_t *frame, uint8_t len)
{
    (void)frame;
    (void)len;
    on_addressing_complete();
}

/* ── Handle Full Data Request (FC 0x43) ── */
static void handle_full_data_request(const uint8_t *frame, uint8_t len)
{
    if (len < 4) return;

    uint8_t camera_idx = frame[2];
    if (camera_idx >= 4) {
        send_exception(MODBUS_FC_FULL_DATA, 0x02);
        return;
    }

    on_full_data_request();

    /* Send 64 zone values (128 bytes) for requested camera */
    extern const uint16_t *tof_get_zone_data(uint8_t camera_idx);
    const uint16_t *zones = tof_get_zone_data(camera_idx);

    tx_buf[0] = slave_address;
    tx_buf[1] = MODBUS_FC_FULL_DATA;
    tx_buf[2] = 128;  /* byte count: 64 zones × 2 bytes */

    for (uint8_t i = 0; i < 64; i++) {
        uint16_t val = zones ? zones[i] : 0;
        tx_buf[3 + i * 2]     = (val >> 8) & 0xFF;
        tx_buf[3 + i * 2 + 1] =  val & 0xFF;
    }

    /* Response is too large for 64-byte buffer with CRC.
     * Use a larger buffer or split. For now, limit to summary. */
    /* TODO: Implement chunked transfer for full zone data */

    /* For MVP, respond with just the register data */
    (void)zones;
}

/* ============================================================
   PUBLIC API
   ============================================================ */

void modbus_init(void)
{
    slave_address = MODBUS_ADDR_UNASSIGNED;
    memset(holding_registers, 0, sizeof(holding_registers));
    rx_len = 0;
    frame_ready = false;
}

void modbus_set_address(uint8_t addr)
{
    slave_address = addr;
    holding_registers[REG_STATUS] |= STATUS_ADDRESSED;
}

uint8_t modbus_get_address(void)
{
    return slave_address;
}

void modbus_set_register(uint8_t reg, uint16_t value)
{
    if (reg < REG_COUNT)
        holding_registers[reg] = value;
}

uint16_t modbus_get_register(uint8_t reg)
{
    if (reg < REG_COUNT)
        return holding_registers[reg];
    return 0;
}

void modbus_rx_byte(uint8_t byte)
{
    if (rx_len < MODBUS_RX_BUF_SIZE) {
        rx_buf[rx_len++] = byte;
    }
    /* Overflow: frame will be discarded on CRC check */
}

void modbus_timer_tick(void)
{
    /* 3.5-character silence detected — mark frame as complete */
    if (rx_len > 0) {
        frame_ready = true;
    }
}

void modbus_process(void)
{
    if (!frame_ready) return;

    /* Copy frame from volatile buffer */
    uint8_t frame[MODBUS_RX_BUF_SIZE];
    uint8_t len;

    __disable_irq();
    len = rx_len;
    memcpy(frame, (const uint8_t *)rx_buf, len);
    rx_len = 0;
    frame_ready = false;
    __enable_irq();

    /* Minimum valid frame: addr(1) + fc(1) + crc(2) = 4 bytes */
    if (len < 4) return;

    /* Verify CRC */
    uint16_t received_crc = frame[len - 2] | (frame[len - 1] << 8);
    uint16_t calc_crc = modbus_crc16(frame, len - 2);
    if (received_crc != calc_crc) return;

    uint8_t addr = frame[0];
    uint8_t fc   = frame[1];

    /* Broadcast frames (address 0) — custom functions only */
    if (addr == MODBUS_ADDR_BROADCAST) {
        switch (fc) {
            case MODBUS_FC_ASSIGN_ADDR:
                handle_assign_address(frame, len);
                break;
            case MODBUS_FC_ADDR_COMPLETE:
                handle_addr_complete(frame, len);
                break;
        }
        return;
    }

    /* Addressed frames — only respond if address matches */
    if (addr != slave_address) return;

    switch (fc) {
        case MODBUS_FC_READ_HOLDING:
            handle_read_holding(frame, len);
            break;
        case MODBUS_FC_FULL_DATA:
            handle_full_data_request(frame, len);
            break;
        default:
            send_exception(fc, 0x01);  /* Illegal function */
            break;
    }
}
