/**
 * BunkScanner Node — Pin Configuration
 * Target: STM32G071RBT6 (LQFP48)
 */
#ifndef PIN_CONFIG_H
#define PIN_CONFIG_H

#include "stm32g0xx_hal.h"

/* ── I2C1: CAM1 + CAM2 (left half of segment) ── */
#define I2C1_SCL_PORT       GPIOB
#define I2C1_SCL_PIN        GPIO_PIN_6
#define I2C1_SDA_PORT       GPIOB
#define I2C1_SDA_PIN        GPIO_PIN_7
#define I2C1_AF             GPIO_AF6_I2C1

/* ── I2C2: CAM3 + CAM4 (right half of segment) ── */
#define I2C2_SCL_PORT       GPIOA
#define I2C2_SCL_PIN        GPIO_PIN_11
#define I2C2_SDA_PORT       GPIOA
#define I2C2_SDA_PIN        GPIO_PIN_12
#define I2C2_AF             GPIO_AF6_I2C2

/* ── USART2: RS485 with hardware DE ── */
#define RS485_TX_PORT       GPIOA
#define RS485_TX_PIN        GPIO_PIN_2
#define RS485_RX_PORT       GPIOA
#define RS485_RX_PIN        GPIO_PIN_3
#define RS485_DE_PORT       GPIOA
#define RS485_DE_PIN        GPIO_PIN_1
#define RS485_AF            GPIO_AF1_USART2
#define RS485_BAUDRATE      115200

/* ── VL53L7CX LPn (enable) pins ── */
#define CAM1_LPN_PORT       GPIOB
#define CAM1_LPN_PIN        GPIO_PIN_0
#define CAM2_LPN_PORT       GPIOB
#define CAM2_LPN_PIN        GPIO_PIN_1
#define CAM3_LPN_PORT       GPIOB
#define CAM3_LPN_PIN        GPIO_PIN_2
#define CAM4_LPN_PORT       GPIOB
#define CAM4_LPN_PIN        GPIO_PIN_3

/* ── Auto-addressing daisy chain ── */
#define ADDR_IN_PORT        GPIOA
#define ADDR_IN_PIN         GPIO_PIN_0      /* Input, pulled high by next node */
#define ADDR_OUT_PORT       GPIOA
#define ADDR_OUT_PIN        GPIO_PIN_4      /* Open-drain output */

/* ── Status LED ── */
#define LED_PORT            GPIOC
#define LED_PIN             GPIO_PIN_6

#endif /* PIN_CONFIG_H */
