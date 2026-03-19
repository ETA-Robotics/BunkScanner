/**
 * BunkScanner Node — VL53L7CX ToF Sensor Driver
 * Manages 4× VL53L7CX sensors on two I2C buses
 */
#ifndef VL53L7CX_DRIVER_H
#define VL53L7CX_DRIVER_H

#include <stdint.h>
#include <stdbool.h>

/* ── Sensor Constants ── */
#define NUM_CAMERAS              4
#define VL53L7CX_DEFAULT_ADDR    0x52
#define CAM1_I2C_ADDR            0x54
#define CAM2_I2C_ADDR            0x56
#define CAM3_I2C_ADDR            0x58
#define CAM4_I2C_ADDR            0x5A

/* ── 8×8 Zone Grid ── */
#define VL53L7CX_RESOLUTION      64   /* 8×8 zones */
#define BUNK_DEPTH_MM             430  /* Internal depth of WFLBT02 bunk */

/* ── Sensor Health ── */
typedef enum {
    SENSOR_OK       = 0,
    SENSOR_DEGRADED = 1,
    SENSOR_FAULT    = 2,
    SENSOR_OFFLINE  = 3,
} sensor_health_t;

/* ── Per-Camera Result ── */
typedef struct {
    uint16_t         fill_pct_x10;    /* Fill % × 10 (0–1000) */
    uint16_t         avg_distance_mm; /* Average distance reading */
    sensor_health_t  health;
    uint8_t          valid_zones;     /* Number of valid zones in last reading */
    uint16_t         zone_data[VL53L7CX_RESOLUTION]; /* Raw zone distances (mm) */
} camera_result_t;

/* ── Aggregated Node Result ── */
typedef struct {
    camera_result_t  cameras[NUM_CAMERAS];
    uint16_t         avg_fill_x10;    /* Average fill across all cameras × 10 */
    uint16_t         variance_x10;    /* Cross-camera variance × 10 */
    uint8_t          confidence;      /* 0–100 measurement confidence */
    uint16_t         status_bits;     /* Sensor health bit field */
} node_measurement_t;

/* ── API ── */

/**
 * Initialize all 4 VL53L7CX sensors.
 * Performs sequential LPn-based I2C address assignment.
 * Returns number of sensors successfully initialized (0–4).
 */
uint8_t  tof_init(void);

/**
 * Trigger a ranging measurement on all sensors.
 * Non-blocking — results available after tof_data_ready() returns true.
 */
void     tof_start_measurement(void);

/**
 * Check if measurement data is ready from all active sensors.
 */
bool     tof_data_ready(void);

/**
 * Read measurement results from all sensors.
 * Populates the provided measurement struct.
 */
void     tof_read_results(node_measurement_t *result);

/**
 * Get raw 8×8 zone data for a specific camera (for on-demand full data).
 * Returns pointer to 64 × uint16_t distance values (mm).
 */
const uint16_t *tof_get_zone_data(uint8_t camera_idx);

/**
 * Get health status of a specific camera.
 */
sensor_health_t tof_get_health(uint8_t camera_idx);

#endif /* VL53L7CX_DRIVER_H */
