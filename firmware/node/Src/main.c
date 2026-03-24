/**
 * BunkScanner Node — Main Application
 * Target: STM32G071RBT6
 *
 * Firmware for a single bunk segment sensor node.
 * - Initializes 4× VL53L7CX ToF sensors via I2C
 * - Responds to Modbus RTU queries from Opta gateway via RS485
 * - Participates in daisy-chain auto-addressing at boot
 * - Measures feed level every 500ms, updates Modbus registers
 */

#include "stm32g0xx_hal.h"
#include "pin_config.h"
#include "modbus_slave.h"
#include "vl53l7cx_driver.h"
#include "auto_address.h"

/* ── Firmware Version ── */
#define FW_VERSION_MAJOR    1
#define FW_VERSION_MINOR    0

/* ── Timing ── */
#define MEASUREMENT_INTERVAL_MS   500
#define LED_BLINK_FAST_MS          100
#define LED_BLINK_SLOW_MS          1000
#define ADDR_TIMEOUT_MS            30000  /* Max time to wait for addressing */

/* ── Peripheral Handles ── */
static UART_HandleTypeDef  huart2;      /* RS485 */
static I2C_HandleTypeDef   hi2c1;       /* CAM1 + CAM2 */
static I2C_HandleTypeDef   hi2c2;       /* CAM3 + CAM4 */
static TIM_HandleTypeDef   htim7;       /* Modbus 3.5-char timer */

/* ── State ── */
static volatile uint32_t tick_ms = 0;
static uint32_t boot_time_s = 0;
static uint8_t  num_sensors_ok = 0;

/* ── Forward Declarations ── */
static void SystemClock_Config(void);
static void GPIO_Init(void);
static void I2C1_Init(void);
static void I2C2_Init(void);
static void USART2_RS485_Init(void);
static void TIM7_Init(void);
static void LED_Set(bool on);
static void LED_Toggle(void);
static void update_registers(const node_measurement_t *m);

/* ============================================================
   MAIN
   ============================================================ */

int main(void)
{
    HAL_Init();
    SystemClock_Config();

    /* Initialize peripherals */
    GPIO_Init();
    I2C1_Init();
    I2C2_Init();
    USART2_RS485_Init();
    TIM7_Init();

    /* Initialize modules */
    addr_chain_init();
    modbus_init();

    /* Try to load previously saved address from flash */
    uint8_t saved_addr = addr_load_from_flash();
    if (saved_addr > 0 && saved_addr <= MODBUS_MAX_ADDRESS) {
        modbus_set_address(saved_addr);
    }

    /* Initialize ToF sensors */
    LED_Set(true);
    num_sensors_ok = tof_init();
    LED_Set(false);

    /* Set firmware version register */
    modbus_set_register(REG_FW_VERSION,
        (FW_VERSION_MAJOR << 8) | FW_VERSION_MINOR);

    boot_time_s = HAL_GetTick() / 1000;

    uint32_t last_measurement = 0;
    uint32_t last_led_toggle = 0;

    /* ── Main Loop ── */
    while (1) {
        uint32_t now = HAL_GetTick();

        /* Process incoming Modbus frames */
        modbus_process();

        /* Periodic measurement */
        if (now - last_measurement >= MEASUREMENT_INTERVAL_MS) {
            last_measurement = now;

            if (num_sensors_ok > 0) {
                tof_start_measurement();
            }
        }

        /* Check if measurement data is ready */
        if (tof_data_ready()) {
            node_measurement_t result;
            tof_read_results(&result);
            update_registers(&result);
        }

        /* Update uptime */
        uint32_t uptime_s = (now / 1000) - boot_time_s;
        modbus_set_register(REG_UPTIME_HI, (uint16_t)(uptime_s >> 16));
        modbus_set_register(REG_UPTIME_LO, (uint16_t)(uptime_s & 0xFFFF));

        /* Status LED pattern */
        uint32_t blink_rate = (modbus_get_address() == MODBUS_ADDR_UNASSIGNED)
                              ? LED_BLINK_FAST_MS : LED_BLINK_SLOW_MS;
        if (now - last_led_toggle >= blink_rate) {
            last_led_toggle = now;
            LED_Toggle();
        }
    }
}

/* ============================================================
   MODBUS CALLBACKS
   ============================================================ */

void on_address_assigned(uint8_t addr)
{
    modbus_set_address(addr);
    addr_chain_enable_next();  /* Enable next node in daisy chain */
}

void on_addressing_complete(void)
{
    uint8_t addr = modbus_get_address();
    if (addr > 0) {
        addr_save_to_flash(addr);
    }
}

void on_full_data_request(void)
{
    /* Full 8×8 zone data request — handled in modbus_process() */
}

/* ============================================================
   REGISTER UPDATE
   ============================================================ */

static void update_registers(const node_measurement_t *m)
{
    modbus_set_register(REG_STATUS,    m->status_bits);
    modbus_set_register(REG_CAM1_FILL, m->cameras[0].fill_pct_x10);
    modbus_set_register(REG_CAM2_FILL, m->cameras[1].fill_pct_x10);
    modbus_set_register(REG_CAM3_FILL, m->cameras[2].fill_pct_x10);
    modbus_set_register(REG_CAM4_FILL, m->cameras[3].fill_pct_x10);
    modbus_set_register(REG_AVG_FILL,  m->avg_fill_x10);
    modbus_set_register(REG_VARIANCE,  m->variance_x10);
    modbus_set_register(REG_CONFIDENCE, m->confidence);

    /* Read internal temperature sensor */
    /* TODO: ADC read of internal temp sensor → REG_NODE_TEMP */
}

/* ============================================================
   PERIPHERAL INITIALIZATION
   ============================================================ */

static void SystemClock_Config(void)
{
    /* Configure HSI16 → PLL → 64 MHz SYSCLK */
    RCC_OscInitTypeDef osc = {0};
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    osc.HSIState = RCC_HSI_ON;
    osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    osc.PLL.PLLState = RCC_PLL_ON;
    osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;
    osc.PLL.PLLM = RCC_PLLM_DIV1;
    osc.PLL.PLLN = 8;
    osc.PLL.PLLP = RCC_PLLP_DIV2;
    osc.PLL.PLLR = RCC_PLLR_DIV2;
    HAL_RCC_OscConfig(&osc);

    RCC_ClkInitTypeDef clk = {0};
    clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK |
                    RCC_CLOCKTYPE_PCLK1;
    clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clk.APB1CLKDivider = RCC_HCLK_DIV1;
    HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_2);
}

static void GPIO_Init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();

    GPIO_InitTypeDef gpio = {0};

    /* Status LED — push-pull output */
    gpio.Pin = LED_PIN;
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(LED_PORT, &gpio);

    /* VL53L7CX LPn pins — push-pull output, start LOW (sensors disabled) */
    gpio.Pin = CAM1_LPN_PIN | CAM2_LPN_PIN | CAM3_LPN_PIN | CAM4_LPN_PIN;
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOB, &gpio);
    HAL_GPIO_WritePin(GPIOB, CAM1_LPN_PIN | CAM2_LPN_PIN |
                             CAM3_LPN_PIN | CAM4_LPN_PIN, GPIO_PIN_RESET);
}

static void I2C1_Init(void)
{
    __HAL_RCC_I2C1_CLK_ENABLE();

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin = I2C1_SCL_PIN;
    gpio.Mode = GPIO_MODE_AF_OD;
    gpio.Pull = GPIO_NOPULL;    /* External 2.2kΩ pull-ups */
    gpio.Speed = GPIO_SPEED_FREQ_HIGH;
    gpio.Alternate = I2C1_AF;
    HAL_GPIO_Init(I2C1_SCL_PORT, &gpio);

    gpio.Pin = I2C1_SDA_PIN;
    HAL_GPIO_Init(I2C1_SDA_PORT, &gpio);

    hi2c1.Instance = I2C1;
    hi2c1.Init.Timing = 0x00602173;  /* 400kHz Fast Mode @ 64MHz PCLK */
    hi2c1.Init.OwnAddress1 = 0;
    hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
    HAL_I2C_Init(&hi2c1);
}

static void I2C2_Init(void)
{
    __HAL_RCC_I2C2_CLK_ENABLE();

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin = I2C2_SCL_PIN;
    gpio.Mode = GPIO_MODE_AF_OD;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_HIGH;
    gpio.Alternate = I2C2_AF;
    HAL_GPIO_Init(I2C2_SCL_PORT, &gpio);

    gpio.Pin = I2C2_SDA_PIN;
    HAL_GPIO_Init(I2C2_SDA_PORT, &gpio);

    hi2c2.Instance = I2C2;
    hi2c2.Init.Timing = 0x00602173;
    hi2c2.Init.OwnAddress1 = 0;
    hi2c2.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
    hi2c2.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c2.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c2.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
    HAL_I2C_Init(&hi2c2);
}

static void USART2_RS485_Init(void)
{
    __HAL_RCC_USART2_CLK_ENABLE();

    /* TX pin */
    GPIO_InitTypeDef gpio = {0};
    gpio.Pin = RS485_TX_PIN;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_HIGH;
    gpio.Alternate = RS485_AF;
    HAL_GPIO_Init(RS485_TX_PORT, &gpio);

    /* RX pin */
    gpio.Pin = RS485_RX_PIN;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(RS485_RX_PORT, &gpio);

    /* DE pin — hardware controlled */
    gpio.Pin = RS485_DE_PIN;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(RS485_DE_PORT, &gpio);

    huart2.Instance = USART2;
    huart2.Init.BaudRate = RS485_BAUDRATE;
    huart2.Init.WordLength = UART_WORDLENGTH_8B;
    huart2.Init.StopBits = UART_STOPBITS_1;
    huart2.Init.Parity = UART_PARITY_NONE;
    huart2.Init.Mode = UART_MODE_TX_RX;
    huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart2.Init.OverSampling = UART_OVERSAMPLING_16;
    HAL_UART_Init(&huart2);

    /* Enable RS485 Driver Enable mode (hardware DE pin control) */
    HAL_RS485Ex_Init(&huart2, UART_DE_POLARITY_HIGH,
                     16,   /* DE assertion time (bit times) */
                     16);  /* DE deassertion time (bit times) */

    /* Enable RXNE interrupt for Modbus byte reception */
    __HAL_UART_ENABLE_IT(&huart2, UART_IT_RXNE);
    HAL_NVIC_SetPriority(USART2_IRQn, 1, 0);
    HAL_NVIC_EnableIRQ(USART2_IRQn);
}

static void TIM7_Init(void)
{
    /* Timer for Modbus 3.5-character timeout at 115200 baud
     * 1 char = 11 bits / 115200 = 95.5µs
     * 3.5 chars = 334µs → use 750µs for safety margin
     * Timer period: 750µs at 64MHz → prescaler=63, period=749
     */
    __HAL_RCC_TIM7_CLK_ENABLE();

    htim7.Instance = TIM7;
    htim7.Init.Prescaler = 63;        /* 64MHz / 64 = 1MHz tick */
    htim7.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim7.Init.Period = 749;          /* 750µs period */
    htim7.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    HAL_TIM_Base_Init(&htim7);

    HAL_NVIC_SetPriority(TIM7_IRQn, 2, 0);
    HAL_NVIC_EnableIRQ(TIM7_IRQn);
}

/* ============================================================
   INTERRUPT HANDLERS
   ============================================================ */

void USART2_IRQHandler(void)
{
    if (__HAL_UART_GET_FLAG(&huart2, UART_FLAG_RXNE)) {
        uint8_t byte = (uint8_t)(huart2.Instance->RDR & 0xFF);
        modbus_rx_byte(byte);

        /* Reset 3.5-char timer on each received byte */
        __HAL_TIM_SET_COUNTER(&htim7, 0);
        HAL_TIM_Base_Start_IT(&htim7);
    }

    /* Clear any error flags */
    if (__HAL_UART_GET_FLAG(&huart2, UART_FLAG_ORE)) {
        __HAL_UART_CLEAR_FLAG(&huart2, UART_CLEAR_OREF);
    }
    if (__HAL_UART_GET_FLAG(&huart2, UART_FLAG_FE)) {
        __HAL_UART_CLEAR_FLAG(&huart2, UART_CLEAR_FEF);
    }
}

void TIM7_IRQHandler(void)
{
    if (__HAL_TIM_GET_FLAG(&htim7, TIM_FLAG_UPDATE)) {
        __HAL_TIM_CLEAR_FLAG(&htim7, TIM_FLAG_UPDATE);
        HAL_TIM_Base_Stop_IT(&htim7);
        modbus_timer_tick();  /* 3.5-char silence detected → frame complete */
    }
}

void SysTick_Handler(void)
{
    HAL_IncTick();
}

/* ============================================================
   HELPERS
   ============================================================ */

static void LED_Set(bool on)
{
    HAL_GPIO_WritePin(LED_PORT, LED_PIN, on ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

static void LED_Toggle(void)
{
    HAL_GPIO_TogglePin(LED_PORT, LED_PIN);
}

/* HAL I2C access for sensor driver */
I2C_HandleTypeDef *get_i2c_handle(uint8_t bus)
{
    return (bus == 0) ? &hi2c1 : &hi2c2;
}

/* HAL UART access for Modbus */
UART_HandleTypeDef *get_uart_handle(void)
{
    return &huart2;
}
