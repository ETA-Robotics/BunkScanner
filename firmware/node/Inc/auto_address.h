/**
 * BunkScanner Node — Daisy-Chain Auto-Addressing
 * Manages ADDR_IN/ADDR_OUT GPIO for sequential address assignment
 */
#ifndef AUTO_ADDRESS_H
#define AUTO_ADDRESS_H

#include <stdint.h>
#include <stdbool.h>

/* ── Flash Storage Key ── */
#define ADDR_FLASH_PAGE          63    /* Last page of 128KB flash */
#define ADDR_FLASH_MAGIC         0xB5AD  /* "BunkScanner ADdress" marker */

/* ── API ── */

/**
 * Initialize ADDR_IN (input) and ADDR_OUT (open-drain output) GPIOs.
 * ADDR_OUT starts HIGH (next node not yet enabled).
 */
void     addr_chain_init(void);

/**
 * Check if this node is eligible for addressing.
 * Returns true if ADDR_IN is LOW (previous node has enabled us).
 */
bool     addr_chain_is_eligible(void);

/**
 * Enable the next node in the chain by driving ADDR_OUT LOW.
 * Called after this node has been successfully addressed.
 */
void     addr_chain_enable_next(void);

/**
 * Save assigned Modbus address to flash.
 * Called when ADDR_COMPLETE broadcast is received.
 */
void     addr_save_to_flash(uint8_t address);

/**
 * Load previously saved address from flash.
 * Returns 0 (unassigned) if no valid address found.
 */
uint8_t  addr_load_from_flash(void);

/**
 * Reset addressing state.
 * Drives ADDR_OUT HIGH, clears assigned address.
 */
void     addr_reset(void);

#endif /* AUTO_ADDRESS_H */
