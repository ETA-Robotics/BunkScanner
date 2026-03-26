/**
 * BunkScanner Node — Modbus RTU Slave
 * Handles RS485 communication with Opta gateway
 */
#ifndef MODBUS_SLAVE_H
#define MODBUS_SLAVE_H

#include <stdint.h>
#include <stdbool.h>

/* ── Modbus Configuration ── */
#define MODBUS_ADDR_UNASSIGNED   0
#define MODBUS_ADDR_BROADCAST    0
#define MODBUS_MAX_ADDRESS       247

/* ── Standard Function Codes ── */
#define MODBUS_FC_READ_HOLDING   0x03
#define MODBUS_FC_WRITE_SINGLE   0x06

/* ── Custom Function Codes ── */
#define MODBUS_FC_ASSIGN_ADDR    0x41
#define MODBUS_FC_ADDR_COMPLETE  0x42
#define MODBUS_FC_FULL_DATA      0x43

/* ── Register Map ── */
#define REG_STATUS               0
#define REG_CAM1_FILL            1
#define REG_CAM2_FILL            2
#define REG_CAM3_FILL            3
#define REG_CAM4_FILL            4
#define REG_AVG_FILL             5
#define REG_VARIANCE             6
#define REG_CONFIDENCE           7
#define REG_NODE_TEMP            8
#define REG_FW_VERSION           9
#define REG_UPTIME_HI            10
#define REG_UPTIME_LO            11
#define REG_COUNT                12

/* ── Status Register Bit Definitions ── */
#define STATUS_CAM1_OK           (1u << 0)
#define STATUS_CAM2_OK           (1u << 1)
#define STATUS_CAM3_OK           (1u << 2)
#define STATUS_CAM4_OK           (1u << 3)
#define STATUS_ADDRESSED         (1u << 4)
#define STATUS_MEASURING         (1u << 5)

/* ── Modbus Frame Limits ── */
#define MODBUS_RX_BUF_SIZE       64
#define MODBUS_TX_BUF_SIZE       64

/* ── API ── */
void     modbus_init(void);
void     modbus_set_address(uint8_t addr);
uint8_t  modbus_get_address(void);
void     modbus_process(void);
void     modbus_set_register(uint8_t reg, uint16_t value);
uint16_t modbus_get_register(uint8_t reg);

/* Called by UART ISR */
void     modbus_rx_byte(uint8_t byte);
void     modbus_timer_tick(void);  /* Called every 750µs for 3.5-char timeout */

/* Callbacks (implemented in main) */
extern void on_address_assigned(uint8_t addr);
extern void on_addressing_complete(void);
extern void on_full_data_request(void);

#endif /* MODBUS_SLAVE_H */
