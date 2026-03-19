/**
 * BunkScanner Node — Daisy-Chain Auto-Addressing Implementation
 *
 * Physical wiring:
 *   ADDR_IN  (PA0) — Input, pulled high by 10kΩ on this node.
 *                     Connected to previous node's ADDR_OUT.
 *                     First node in chain has ADDR_IN tied to GND.
 *   ADDR_OUT (PA4) — Open-drain output, defaults HIGH (next node disabled).
 *                     Driven LOW to enable the next node for addressing.
 *
 * Sequence:
 *   1. On boot, ADDR_OUT = HIGH (next node's ADDR_IN sees HIGH → not eligible)
 *   2. Gateway broadcasts ASSIGN_ADDRESS(N)
 *   3. Only the node with ADDR_IN = LOW responds (accepts address N)
 *   4. That node drives ADDR_OUT = LOW (enabling next node)
 *   5. Repeat until all nodes are addressed
 *   6. Gateway broadcasts ADDR_COMPLETE → nodes save addresses to flash
 */

#include "auto_address.h"
#include "pin_config.h"
#include "stm32g0xx_hal.h"
#include <string.h>

/* ── Flash Storage Layout ── */
/* Last page of flash (page 63): 2KB at 0x0801F800 */
#define FLASH_ADDR_BASE  (0x08000000 + (ADDR_FLASH_PAGE * 2048))

typedef struct {
    uint16_t magic;      /* ADDR_FLASH_MAGIC */
    uint8_t  address;    /* Modbus address */
    uint8_t  reserved;   /* Alignment padding */
} addr_flash_data_t;

void addr_chain_init(void)
{
    GPIO_InitTypeDef gpio = {0};

    /* ADDR_IN — Input with pull-up (HIGH = not eligible) */
    gpio.Pin = ADDR_IN_PIN;
    gpio.Mode = GPIO_MODE_INPUT;
    gpio.Pull = GPIO_PULLUP;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(ADDR_IN_PORT, &gpio);

    /* ADDR_OUT — Open-drain, start HIGH (next node not enabled) */
    gpio.Pin = ADDR_OUT_PIN;
    gpio.Mode = GPIO_MODE_OUTPUT_OD;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(ADDR_OUT_PORT, &gpio);
    HAL_GPIO_WritePin(ADDR_OUT_PORT, ADDR_OUT_PIN, GPIO_PIN_SET);
}

bool addr_chain_is_eligible(void)
{
    /* Eligible when ADDR_IN is LOW (pulled down by previous node or GND) */
    return (HAL_GPIO_ReadPin(ADDR_IN_PORT, ADDR_IN_PIN) == GPIO_PIN_RESET);
}

void addr_chain_enable_next(void)
{
    /* Drive ADDR_OUT LOW to signal the next node it can accept an address */
    HAL_GPIO_WritePin(ADDR_OUT_PORT, ADDR_OUT_PIN, GPIO_PIN_RESET);
}

void addr_save_to_flash(uint8_t address)
{
    addr_flash_data_t data;
    data.magic = ADDR_FLASH_MAGIC;
    data.address = address;
    data.reserved = 0xFF;

    /* Unlock flash */
    HAL_FLASH_Unlock();

    /* Erase the page */
    FLASH_EraseInitTypeDef erase = {0};
    erase.TypeErase = FLASH_TYPEERASE_PAGES;
    erase.Page = ADDR_FLASH_PAGE;
    erase.NbPages = 1;

    uint32_t page_error = 0;
    HAL_FLASHEx_Erase(&erase, &page_error);

    /* Write data as double-word (8 bytes, flash programming unit on G0) */
    uint64_t write_data = 0xFFFFFFFFFFFFFFFF;
    memcpy(&write_data, &data, sizeof(data));
    HAL_FLASH_Program(FLASH_TYPEPROGRAM_DOUBLEWORD, FLASH_ADDR_BASE, write_data);

    HAL_FLASH_Lock();
}

uint8_t addr_load_from_flash(void)
{
    const addr_flash_data_t *stored =
        (const addr_flash_data_t *)FLASH_ADDR_BASE;

    if (stored->magic == ADDR_FLASH_MAGIC &&
        stored->address > 0 &&
        stored->address <= 247) {
        return stored->address;
    }

    return 0;  /* No valid address stored */
}

void addr_reset(void)
{
    /* Drive ADDR_OUT HIGH (disable next node) */
    HAL_GPIO_WritePin(ADDR_OUT_PORT, ADDR_OUT_PIN, GPIO_PIN_SET);
}
