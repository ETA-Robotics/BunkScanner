# BunkScanner Firmware

RS485 Modbus RTU sensor network for feedlot bunk monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Dashboard                            │
│                     (browser, app.js)                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP REST
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Backend Server                        │
│                      (server.js:3000)                            │
└────┬────────┬────────┬────────┬────────┬────────┬────────┬──────┘
     │        │        │        │        │        │        │
     ▼        ▼        ▼        ▼        ▼        ▼        ▼
  Opta #1  Opta #2  Opta #3  Opta #4  Opta #5  Opta #6  Opta #7
  BUS-D    BUS-C1   BUS-C2   BUS-B1   BUS-B2   BUS-Z1   BUS-Z2
     │        │        │        │        │        │        │
     ▼        ▼        ▼        ▼        ▼        ▼        ▼
  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐
  │~117 │  │~108 │  │~107 │  │~104 │  │~104 │  │~104 │  │~104 │
  │nodes│  │nodes│  │nodes│  │nodes│  │nodes│  │nodes│  │nodes│
  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘
           RS485 daisy-chain, 115200 baud, 24V DC power
```

## Directory Structure

```
code/firmware/
├── node/                         STM32 sensor node firmware
│   ├── Inc/
│   │   ├── pin_config.h          GPIO/peripheral pin assignments
│   │   ├── modbus_slave.h        Modbus RTU slave API
│   │   ├── vl53l7cx_driver.h     VL53L7CX ToF sensor driver API
│   │   └── auto_address.h        Daisy-chain auto-addressing API
│   ├── Src/
│   │   ├── main.c                Application entry point & peripheral init
│   │   ├── modbus_slave.c        Modbus RTU slave implementation
│   │   ├── vl53l7cx_driver.c     ToF sensor driver (wraps ST ULD)
│   │   └── auto_address.c        Auto-addressing GPIO & flash storage
│   ├── Drivers/                  (add STM32G0 HAL + VL53L7CX ULD here)
│   ├── CMakeLists.txt            CMake build configuration
│   └── STM32G071RBTx_FLASH.ld   Linker script
│
└── gateway/
    └── opta_gateway/
        └── opta_gateway.ino      Arduino Opta gateway sketch
```

## Node Firmware (STM32G071RBT6)

### Prerequisites

1. **ARM GCC Toolchain**: `arm-none-eabi-gcc` (10.3+ recommended)
2. **STM32G0xx HAL**: Download from [ST](https://www.st.com/en/embedded-software/stm32cubeg0.html) and place in `Drivers/`
3. **VL53L7CX ULD**: Download from [ST](https://www.st.com/en/embedded-software/stsw-img036.html) and place in `Drivers/`
4. **CMake**: 3.20+
5. **ST-Link or J-Link**: For flashing

### Building

```bash
cd code/firmware/node
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)
```

Output: `bunkscanner_node.hex`, `bunkscanner_node.bin`

### Flashing

```bash
# With ST-Link
st-flash write bunkscanner_node.bin 0x08000000

# With OpenOCD
openocd -f interface/stlink.cfg -f target/stm32g0x.cfg \
        -c "program bunkscanner_node.hex verify reset exit"
```

### Pin Map (LQFP48)

| Function       | Pin  | Port   | Notes                    |
|----------------|------|--------|--------------------------|
| I2C1 SCL       | 42   | PB6    | CAM1+CAM2, 400kHz        |
| I2C1 SDA       | 43   | PB7    | External 2.2kΩ pull-ups  |
| I2C2 SCL       | 21   | PA11   | CAM3+CAM4, 400kHz        |
| I2C2 SDA       | 22   | PA12   | External 2.2kΩ pull-ups  |
| RS485 TX       | 12   | PA2    | USART2                   |
| RS485 RX       | 13   | PA3    | USART2                   |
| RS485 DE       | 11   | PA1    | Hardware DE control       |
| CAM1 LPn       | 26   | PB0    | Sensor enable             |
| CAM2 LPn       | 27   | PB1    | Sensor enable             |
| CAM3 LPn       | 28   | PB2    | Sensor enable             |
| CAM4 LPn       | 29   | PB3    | Sensor enable             |
| ADDR_IN        | 10   | PA0    | Input, pull-up            |
| ADDR_OUT       | 14   | PA4    | Open-drain output         |
| Status LED     | 37   | PC6    | Push-pull                 |

### Modbus Register Map

| Register | Name       | Type   | Description                          |
|----------|------------|--------|--------------------------------------|
| 0        | STATUS     | UINT16 | Sensor health bits + node state      |
| 1        | CAM1_FILL  | UINT16 | Fill % × 10 (0–1000)                |
| 2        | CAM2_FILL  | UINT16 | Fill % × 10                         |
| 3        | CAM3_FILL  | UINT16 | Fill % × 10                         |
| 4        | CAM4_FILL  | UINT16 | Fill % × 10                         |
| 5        | AVG_FILL   | UINT16 | Average fill × 10                   |
| 6        | VARIANCE   | UINT16 | Cross-sensor variance × 10          |
| 7        | CONFIDENCE | UINT16 | Measurement confidence (0–100)      |

Custom function codes: `0x41` (assign address), `0x42` (address complete), `0x43` (full zone data)

## Gateway Firmware (Arduino Opta)

### Prerequisites

1. **Arduino IDE** 2.x or **arduino-cli**
2. **Board package**: Arduino Mbed OS Opta Boards
3. **Libraries**: ArduinoRS485, Ethernet, ArduinoJson

### Configuration

Edit the constants at the top of `opta_gateway.ino` per unit:

```cpp
const char* BUS_ID    = "BUS-D";   // Unique per gateway
const char* SIDE      = "D";
byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01 }; // Unique MAC
IPAddress serverIP(192, 168, 1, 100);  // Backend server
```

### Upload

```bash
arduino-cli compile --fqbn arduino:mbed_opta:opta opta_gateway
arduino-cli upload --fqbn arduino:mbed_opta:opta -p /dev/ttyACM0 opta_gateway
```

### Bus Assignments

| Opta # | BUS_ID | SIDE | PEN_START | PEN_END | MAC last byte |
|--------|--------|------|-----------|---------|---------------|
| 1      | BUS-D  | D    | 1         | 8       | 0x01          |
| 2      | BUS-C1 | C    | 1         | 8       | 0x02          |
| 3      | BUS-C2 | C    | 9         | 15      | 0x03          |
| 4      | BUS-B1 | B    | 1         | 10      | 0x04          |
| 5      | BUS-B2 | B    | 11        | 20      | 0x05          |
| 6      | BUS-Z1 | Z    | 1         | 5       | 0x06          |
| 7      | BUS-Z2 | Z    | 6         | 10      | 0x07          |

## Backend Server

```bash
cd /path/to/BunkScanner
npm install
npm start
# Server runs on http://localhost:3000
```

## Auto-Addressing Sequence

1. All nodes boot with ADDR_OUT = HIGH (next node disabled)
2. First node in chain has ADDR_IN tied to GND (always eligible)
3. Opta broadcasts `ASSIGN_ADDRESS(1)` → first node accepts, drives ADDR_OUT LOW
4. Opta broadcasts `ASSIGN_ADDRESS(2)` → second node accepts
5. Repeat until no response
6. Opta broadcasts `ADDR_COMPLETE` → all nodes save addresses to flash
7. ~2 seconds for 120 nodes

## Wiring Per Segment

5-conductor cable between adjacent nodes:

| Wire    | Function   | Gauge  |
|---------|------------|--------|
| Pair 1A | RS485 A    | 24 AWG (shielded twisted pair) |
| Pair 1B | RS485 B    | 24 AWG |
| Power + | 24V DC     | 14 AWG (2.5mm²) |
| Power - | GND        | 14 AWG (2.5mm²) |
| Signal  | ADDR_CHAIN | 24 AWG |

120Ω termination at both ends. 560Ω bias at Opta end. Dual-end 24V injection (feed from both ends of each bus).

## TODO

- [ ] Integrate actual VL53L7CX ULD into `code/firmware/node/Src/vl53l7cx_driver.c`
- [ ] Implement chunked full zone data transfer (FC 0x43)
- [ ] Add OTA firmware update via RS485 (STM32G0 UART bootloader)
- [ ] Add ADDR_CHAIN bypass timeout for dead-node skip
- [ ] PCB design (KiCad schematic + layout)
- [ ] Enclosure selection (IP65+ for outdoor)
- [ ] Power supply procurement (Mean Well HDR-60-24 × 14)
