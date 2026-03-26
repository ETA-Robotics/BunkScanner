# Hardware Prototyping Plan
## BunkScanner Phase 1 - Weeks 8-13

**Status**: DESIGN PHASE — schematic not yet started  
**Target**: 50-node pilot system for field validation  
**Revision**: 2.0 — March 2026  

---

## STM32G071 Sensor Node PCB Design

### Microcontroller Specifications
- **MCU**: STM32G071RBT6-M0 (QFN-64 package)
- **CPU**: 32-bit ARM Cortex-M0+ at 64 MHz
- **Memory**: 64KB Flash, 36KB SRAM
- **Interfaces**: 2× I2C (400kHz), 1× USART (RS485), GPIO

### Sensor Interface Design
**4× VL53L7CX Time-of-Flight Sensors**
- **Bus 1**: I2C1 — Sensors at 0x54, 0x56 (GPIO enable: PA2, PA3)
- **Bus 2**: I2C2 — Sensors at 0x58, 0x5A (GPIO enable: PA4, PA5)
- **Power Control**: Individual LPn pins per sensor (low-power management)
- **Interrupt Lines**: XSHUT pins connected to GPIO for reset control

**Firmware status for sensor interface**: VL53L7CX driver is ~60% complete. I2C communication partial. Sensor fusion algorithm not yet implemented. Distance-to-fill conversion formula not defined.

### RS485 Communication
- **UART**: USART1 with hardware DE control (PA1)
- **Transceiver**: MAX485 or equivalent (3.3V/5V compatible)
- **Termination**: Switchable 120-ohm resistors via jumper
- **Connector**: RJ45 or terminal block for daisy-chain wiring

### Power System
- **Input**: 24V DC via RS485 cable (shared power/data)
- **Regulation**: 3.3V @ 500mA (linear regulator + switching option)
- **Current Budget**:
  - STM32: ~50mA active, 5uA sleep
  - 4× VL53L7CX: ~100mA measurement, 10uA standby
  - Total: ~150mA active, <20uA sleep

### Auto-Addressing Hardware
- **ADDR_IN**: PA6 input (pulled high, driven low by previous node)
- **ADDR_OUT**: PA7 output (open-drain, pulled high via 10K)
- **Status LED**: PA8 — Node address indication
- **Flash Storage**: Page 63 reserved for address persistence

**Note**: Auto-addressing firmware is written but untested on physical hardware. Prior art concern with AU2012245501B2 (Schneider) — see IP_STRATEGY.md.

---

## PCB Design Specifications

### Board Size & Layout
- **Form Factor**: 60mm × 40mm (fits standard enclosure)
- **Layers**: 4-layer PCB (power/ground planes)
- **Mounting**: 4× M3 holes for bracket attachment
- **Environmental**: Conformal coating for feedlot conditions

### Component Placement
```
    [VL53L7CX-1] [VL53L7CX-2]
         |            |
    [VL53L7CX-3] [VL53L7CX-4]
         |            |
    +--[STM32G071]----[MAX485]--+
    |                           |
    [Power Reg]----[24V Input]--+
    |                           |
    +--[ADDR I/O]----[Status]---+
```

### Connector Design
- **Power/RS485**: RJ45 or 6-pin terminal (24V, GND, A+, B-, ADDR_IN, ADDR_OUT)
- **Programming**: 10-pin SWD header (production programming)
- **Test Points**: I2C buses, power rails, control signals

---

## Prototyping Timeline

### Week 8-9: PCB Design
- [ ] **Schematic Design**: Complete electrical design and component selection
- [ ] **PCB Layout**: 4-layer routing with proper power distribution
- [ ] **Design Review**: Internal validation + external consultant review
- [ ] **Fabrication Files**: Gerber generation and manufacturer selection

### Week 10-11: PCB Fabrication & Assembly
- [ ] **Fabrication**: PCB manufacturing (5-7 day lead time)
- [ ] **Component Procurement**: Order all components for 50 prototypes
- [ ] **Assembly**: Hand assembly or prototype assembly service
- [ ] **Initial Testing**: Power-on, programming, basic functionality

### Week 12-13: System Integration
- [ ] **Firmware Integration**: Load production firmware on prototypes
- [ ] **Sensor Calibration**: VL53L7CX initialization and testing
- [ ] **Communication Testing**: RS485 and auto-addressing validation on hardware
- [ ] **Environmental Testing**: Temperature, humidity, vibration tests

**Prerequisite**: VL53L7CX sensor samples must be ordered by Week 6 to arrive in time. 8-16 week lead time is the bottleneck.

---

## 50-Node Pilot Test Plan

### Configuration
**Setup**: Single bus (BUS-D equivalent)  
**Coverage**: 12-15 pens at Barmount facility  
**Duration**: 2-week continuous operation test  

### Test Scenarios
1. **Auto-Addressing**: 50 nodes in daisy-chain configuration
2. **Data Collection**: 30-second polling cycle, data integrity validation
3. **Environmental**: Outdoor installation, weather resistance testing
4. **Reliability**: 24/7 operation with failure rate monitoring
5. **Accuracy**: Feed level measurements vs. manual bunk scoring

### Success Criteria
- [ ] **100% Auto-Addressing**: All 50 nodes automatically configured
- [ ] **>99% Uptime**: Less than 1% communication failures
- [ ] **+-5cm Accuracy**: Feed level measurement within specification
- [ ] **14-Day Reliability**: Continuous operation without intervention

### What Must Be Done Before Pilot
- [ ] VL53L7CX driver completed (currently ~60%)
- [ ] Sensor fusion / confidence scoring implemented
- [ ] Distance-to-fill conversion formula defined and calibrated
- [ ] Power management firmware completed
- [ ] Watchdog / recovery firmware implemented

---

## Manufacturing Scaling (Post-Pilot)

### Full Deployment: 748 Nodes
- **748× STM32G071RBT6**: $1,496-2,992
- **2,992× VL53L7CX**: $17,952-29,920 (bulk pricing)
- **748× Custom PCBs**: $11,220-18,700 (design + assembly)
- **Enclosures & Hardware**: $3,740-11,220

### Manufacturing Partners
- [ ] Qualify 2-3 PCB fabrication shops
- [ ] SMT assembly service for volume production
- [ ] Automated testing and programming setup
- [ ] Quality control and batch testing procedures

### Production Timeline (Per Batch)
- PCB Fabrication: 7-10 days
- Component Assembly: 5-7 days (automated SMT)
- Testing & Programming: 2-3 days (batch)
- Total: 14-20 days for 748 nodes

---

## Budget (Corrected)

### Prototyping Costs (50-Node Pilot)
| Item | Cost |
|------|------|
| PCB Design & Layout | $8,000-12,000 |
| 50× Prototype PCBs | $2,500-5,000 |
| 200× VL53L7CX sensors (pilot + spares) | $1,600-2,400 |
| 50× STM32G071 + passives | $500-1,000 |
| Assembly & Testing | $3,000-8,000 |
| Design Tools & Equipment | $2,000-5,000 |
| **Prototype Total** | **$17,600-33,400** |

### Production Preparation
| Item | Cost |
|------|------|
| Manufacturing tooling | $5,000-10,000 |
| Quality systems setup | $3,000-8,000 |
| Volume component deposits | $10,000-25,000 |
| **Production Prep Total** | **$18,000-43,000** |

**Combined Phase 1 Hardware**: $35,600-76,400

---

## Next Actions

1. **Order VL53L7CX samples** — lead time is 8-16 weeks, start now
2. **Begin schematic in KiCad** — STM32G071 + VL53L7CX circuit design
3. **Complete firmware gaps** — VL53L7CX driver, sensor fusion, power management
4. **Identify PCB fab partners** — get quotes for 50-board pilot run
5. **Acquire test equipment** — oscilloscope, logic analyser, power supplies

**Critical path**: Sensor availability determines when prototyping can begin.

---

*Prototyping Plan Version 2.0*  
*Revised: March 19, 2026*