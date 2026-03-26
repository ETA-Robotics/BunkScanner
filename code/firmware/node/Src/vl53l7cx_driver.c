/**
 * BunkScanner Node — VL53L7CX ToF Sensor Driver
 *
 * Manages 4× VL53L7CX multizone ToF sensors across two I2C buses.
 * - Sequential LPn-based I2C address assignment at init
 * - 8×8 zone ranging with fill percentage computation
 * - Split across I2C1 (CAM1+CAM2) and I2C2 (CAM3+CAM4)
 *
 * Note: This driver wraps the ST VL53L7CX ULD (Ultra Lite Driver).
 * The actual ULD source files must be placed in code/firmware/node/Drivers/.
 */

#include "vl53l7cx_driver.h"
#include "pin_config.h"
#include "stm32g0xx_hal.h"
#include <string.h>

/* ── External HAL access ── */
extern I2C_HandleTypeDef *get_i2c_handle(uint8_t bus);

/* ── Sensor I2C Addresses ── */
static const uint8_t cam_addrs[NUM_CAMERAS] = {
    CAM1_I2C_ADDR, CAM2_I2C_ADDR, CAM3_I2C_ADDR, CAM4_I2C_ADDR
};

/* ── I2C Bus Assignment: CAM1,CAM2 → bus 0 (I2C1), CAM3,CAM4 → bus 1 (I2C2) ── */
static const uint8_t cam_bus[NUM_CAMERAS] = { 0, 0, 1, 1 };

/* ── LPn Pin Mapping ── */
static GPIO_TypeDef *const lpn_ports[NUM_CAMERAS] = {
    CAM1_LPN_PORT, CAM2_LPN_PORT, CAM3_LPN_PORT, CAM4_LPN_PORT
};
static const uint16_t lpn_pins[NUM_CAMERAS] = {
    CAM1_LPN_PIN, CAM2_LPN_PIN, CAM3_LPN_PIN, CAM4_LPN_PIN
};

/* ── Per-Camera State ── */
typedef struct {
    bool             initialized;
    bool             ranging_active;
    sensor_health_t  health;
    uint16_t         zone_distances[VL53L7CX_RESOLUTION];
    uint16_t         fill_pct_x10;
    uint8_t          valid_zones;
} cam_state_t;

static cam_state_t cameras[NUM_CAMERAS];
static volatile bool measurement_pending = false;
static volatile bool data_ready_flag = false;

/* ── I2C Low-Level Helpers ── */

static HAL_StatusTypeDef i2c_write_reg16(uint8_t bus, uint8_t dev_addr,
                                          uint16_t reg, uint8_t *data, uint16_t len)
{
    I2C_HandleTypeDef *hi2c = get_i2c_handle(bus);
    return HAL_I2C_Mem_Write(hi2c, dev_addr << 1, reg,
                             I2C_MEMADD_SIZE_16BIT, data, len, 100);
}

static HAL_StatusTypeDef i2c_read_reg16(uint8_t bus, uint8_t dev_addr,
                                         uint16_t reg, uint8_t *data, uint16_t len)
{
    I2C_HandleTypeDef *hi2c = get_i2c_handle(bus);
    return HAL_I2C_Mem_Read(hi2c, dev_addr << 1, reg,
                            I2C_MEMADD_SIZE_16BIT, data, len, 100);
}

/* ── Sensor Address Reprogramming ── */

static bool reprogram_i2c_address(uint8_t bus, uint8_t new_addr)
{
    /*
     * VL53L7CX address change procedure:
     * Write new address (7-bit) to register 0x0001 on default address.
     */
    uint8_t addr_byte = new_addr;
    HAL_StatusTypeDef status = i2c_write_reg16(bus, VL53L7CX_DEFAULT_ADDR,
                                                0x0001, &addr_byte, 1);
    return (status == HAL_OK);
}

/* ── Sensor Initialization ── */

static bool init_single_sensor(uint8_t idx)
{
    uint8_t bus = cam_bus[idx];

    /* Step 1: Enable sensor via LPn pin */
    HAL_GPIO_WritePin(lpn_ports[idx], lpn_pins[idx], GPIO_PIN_SET);
    HAL_Delay(10);  /* Wait for sensor to boot */

    /* Step 2: Check sensor responds at default address */
    I2C_HandleTypeDef *hi2c = get_i2c_handle(bus);
    if (HAL_I2C_IsDeviceReady(hi2c, VL53L7CX_DEFAULT_ADDR << 1, 3, 100) != HAL_OK) {
        cameras[idx].health = SENSOR_OFFLINE;
        return false;
    }

    /* Step 3: Reprogram to unique address */
    if (!reprogram_i2c_address(bus, cam_addrs[idx])) {
        cameras[idx].health = SENSOR_FAULT;
        return false;
    }
    HAL_Delay(5);

    /* Step 4: Verify sensor responds at new address */
    if (HAL_I2C_IsDeviceReady(hi2c, cam_addrs[idx] << 1, 3, 100) != HAL_OK) {
        cameras[idx].health = SENSOR_FAULT;
        return false;
    }

    /* Step 5: Configure sensor for 8×8 resolution, continuous ranging */
    /*
     * TODO: Replace with actual VL53L7CX ULD initialization calls:
     *   vl53l7cx_init(&dev[idx]);
     *   vl53l7cx_set_resolution(&dev[idx], VL53L7CX_RESOLUTION_8X8);
     *   vl53l7cx_set_ranging_frequency_hz(&dev[idx], 5);  // 5Hz
     *   vl53l7cx_set_ranging_mode(&dev[idx], VL53L7CX_RANGING_MODE_CONTINUOUS);
     */

    cameras[idx].initialized = true;
    cameras[idx].health = SENSOR_OK;
    return true;
}

/* ── Fill Percentage Calculation ── */

static void compute_fill(uint8_t idx)
{
    cam_state_t *cam = &cameras[idx];
    if (!cam->initialized || cam->health >= SENSOR_FAULT) {
        cam->fill_pct_x10 = 0;
        cam->valid_zones = 0;
        return;
    }

    uint32_t total_fill = 0;
    uint8_t valid = 0;

    for (uint8_t z = 0; z < VL53L7CX_RESOLUTION; z++) {
        uint16_t dist_mm = cam->zone_distances[z];

        /* Filter out invalid readings (0 or > 2× bunk depth) */
        if (dist_mm == 0 || dist_mm > BUNK_DEPTH_MM * 2) continue;

        /* Clamp to bunk depth */
        if (dist_mm > BUNK_DEPTH_MM) dist_mm = BUNK_DEPTH_MM;

        /* Fill % = (depth - distance) / depth × 100
         * distance = 0 → full (100%), distance = depth → empty (0%) */
        uint16_t fill = ((BUNK_DEPTH_MM - dist_mm) * 1000) / BUNK_DEPTH_MM;
        total_fill += fill;
        valid++;
    }

    cam->valid_zones = valid;
    if (valid > 0) {
        cam->fill_pct_x10 = (uint16_t)(total_fill / valid);
    } else {
        cam->fill_pct_x10 = 0;
        cam->health = SENSOR_DEGRADED;
    }
}

/* ============================================================
   PUBLIC API
   ============================================================ */

uint8_t tof_init(void)
{
    memset(cameras, 0, sizeof(cameras));

    /*
     * Sequential LPn-based address assignment:
     * Enable one sensor at a time, reprogram its I2C address,
     * then enable the next. This avoids address conflicts since
     * all sensors share the same default address.
     */
    uint8_t ok_count = 0;
    for (uint8_t i = 0; i < NUM_CAMERAS; i++) {
        if (init_single_sensor(i)) {
            ok_count++;
        }
    }

    return ok_count;
}

void tof_start_measurement(void)
{
    measurement_pending = true;
    data_ready_flag = false;

    /*
     * Trigger ranging on all initialized sensors.
     * In production, use VL53L7CX ULD:
     *   vl53l7cx_start_ranging(&dev[i]);
     *
     * For now, simulate by reading current zone data.
     */
    for (uint8_t i = 0; i < NUM_CAMERAS; i++) {
        if (!cameras[i].initialized) continue;

        uint8_t bus = cam_bus[i];

        /*
         * TODO: Replace with actual VL53L7CX ULD data-ready check and read:
         *   uint8_t ready = 0;
         *   vl53l7cx_check_data_ready(&dev[i], &ready);
         *   if (ready) {
         *       VL53L7CX_ResultsData results;
         *       vl53l7cx_get_ranging_data(&dev[i], &results);
         *       // Copy zone distances from results.distance_mm[]
         *   }
         */

        /* Placeholder: read raw distance data from sensor registers */
        uint8_t raw_data[VL53L7CX_RESOLUTION * 2];
        HAL_StatusTypeDef status = i2c_read_reg16(bus, cam_addrs[i],
                                                   0x0000, raw_data,
                                                   sizeof(raw_data));

        if (status == HAL_OK) {
            for (uint8_t z = 0; z < VL53L7CX_RESOLUTION; z++) {
                cameras[i].zone_distances[z] =
                    (raw_data[z * 2] << 8) | raw_data[z * 2 + 1];
            }
            cameras[i].health = SENSOR_OK;
        } else {
            cameras[i].health = SENSOR_DEGRADED;
        }
    }

    /* Compute fill percentages */
    for (uint8_t i = 0; i < NUM_CAMERAS; i++) {
        compute_fill(i);
    }

    measurement_pending = false;
    data_ready_flag = true;
}

bool tof_data_ready(void)
{
    return data_ready_flag;
}

void tof_read_results(node_measurement_t *result)
{
    if (!data_ready_flag) {
        memset(result, 0, sizeof(*result));
        return;
    }

    data_ready_flag = false;

    uint16_t status_bits = 0;
    uint32_t total_fill = 0;
    uint16_t min_fill = 1000;
    uint16_t max_fill = 0;
    uint8_t  active_cams = 0;

    for (uint8_t i = 0; i < NUM_CAMERAS; i++) {
        result->cameras[i].fill_pct_x10 = cameras[i].fill_pct_x10;
        result->cameras[i].avg_distance_mm = 0; /* TODO: compute average */
        result->cameras[i].health = cameras[i].health;
        result->cameras[i].valid_zones = cameras[i].valid_zones;
        memcpy(result->cameras[i].zone_data, cameras[i].zone_distances,
               sizeof(cameras[i].zone_distances));

        if (cameras[i].health <= SENSOR_DEGRADED && cameras[i].initialized) {
            status_bits |= (1u << i);
            total_fill += cameras[i].fill_pct_x10;
            if (cameras[i].fill_pct_x10 < min_fill)
                min_fill = cameras[i].fill_pct_x10;
            if (cameras[i].fill_pct_x10 > max_fill)
                max_fill = cameras[i].fill_pct_x10;
            active_cams++;
        }
    }

    result->status_bits = status_bits;

    if (active_cams > 0) {
        result->avg_fill_x10 = (uint16_t)(total_fill / active_cams);
        result->variance_x10 = max_fill - min_fill;
        result->confidence = (active_cams * 25); /* 25% per working camera */
    } else {
        result->avg_fill_x10 = 0;
        result->variance_x10 = 0;
        result->confidence = 0;
    }
}

const uint16_t *tof_get_zone_data(uint8_t camera_idx)
{
    if (camera_idx >= NUM_CAMERAS || !cameras[camera_idx].initialized)
        return NULL;
    return cameras[camera_idx].zone_distances;
}

sensor_health_t tof_get_health(uint8_t camera_idx)
{
    if (camera_idx >= NUM_CAMERAS)
        return SENSOR_OFFLINE;
    return cameras[camera_idx].health;
}
