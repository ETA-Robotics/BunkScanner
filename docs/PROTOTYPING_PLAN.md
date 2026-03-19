# Hardware Prototyping Plan
## BunkScanner Phase 1 - Weeks 8-13

**Status**: PROTOTYPING SETUP  
**Target**: 50-node pilot system for validation  

---

## STM32G071 Sensor Node PCB Design

### Microcontroller Specifications:
- **MCU**: STM32G071RBT6-M0 (QFN-64 package)  
- **CPU**: 32-bit ARM Cortex-M0+ at 64 MHz
- **Memory**: 64KB Flash, 36KB SRAM  
- **Interfaces**: 2× I2C (400kHz), 1× USART (RS485), GPIO

### Sensor Interface Design:
**4× VL53L7CX Time-of-Flight Sensors**
- **Bus 1**: I2C1 - Sensors at 0x54, 0x56 (GPIO enable: PA2, PA3)
- **Bus 2**: I2C2 - Sensors at 0x58, 0x5A (GPIO enable: PA4, PA5)  
- **Power Control**: Individual LPn pins per sensor (low-power management)
- **Interrupt Lines**: XSHUT pins connected to GPIO for reset control

### RS485 Communication:
- **UART**: USART1 with hardware DE control (PA1)
- **Transceiver**: MAX485 or equivalent (3.3V/5V compatible)  
- **Termination**: Switchable 120Ω resistors via jumper
- **Connector**: RJ45 or terminal block for daisy-chain wiring

### Power System:
- **Input**: 24V DC via RS485 cable (shared power/data)
- **Regulation**: 3.3V @ 500mA (Linear regulator + switching option)
- **Current Budget**: 
  - STM32: ~50mA active, 5µA sleep
  - 4× VL53L7CX: ~100mA measurement, 10µA standby
  - Total: ~150mA active, <20µA sleep

### Auto-Addressing Hardware:
- **ADDR_IN**: PA6 input (pulled high, driven low by previous node)
- **ADDR_OUT**: PA7 output (open-drain, pulled high via 10kΩ)
- **Status LED**: PA8 - Node address indication
- **Flash Storage**: Page 63 reserved for address persistence

---

## PCB Design Specifications

### Board Size & Layout:
- **Form Factor**: 60mm × 40mm (fits standard enclosure)
- **Layers**: 4-layer PCB (power/ground planes)
- **Mounting**: 4× M3 holes for bracket attachment
- **Environmental**: Conformal coating for feedlot conditions

### Component Placement:
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

### Connector Design:
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
- [ ] **Communication Testing**: RS485 and auto-addressing validation  
- [ ] **Environmental Testing**: Temperature, humidity, vibration tests

---

## Prototype Testing Plan

### 50-Node Pilot System:
**Configuration**: Single bus (BUS-D equivalent)  
**Coverage**: 12-15 pens at Barmount facility  
**Duration**: 2-week continuous operation test  

### Test Scenarios:
1. **Auto-Addressing**: 50 nodes in daisy-chain configuration
2. **Data Collection**: 30-second polling cycle, data integrity validation
3. **Environmental**: Outdoor installation, weather resistance testing  
4. **Reliability**: 24/7 operation with failure rate monitoring
5. **Performance**: Response time, accuracy vs. manual measurements

### Success Criteria:
- [ ] **100% Auto-Addressing**: All 50 nodes automatically configured
- [ ] **>99% Uptime**: Less than 1% communication failures
- [ ] **±5cm Accuracy**: Feed level measurement within specification
- [ ] **14-Day Reliability**: Continuous operation without intervention  

---

## Manufacturing Preparation

### Production Scaling Plan:
**Target**: 540 nodes for full system (10× prototype scale)  

### Component Requirements:
- **540× STM32G071RBT6**: ~$1,620-2,700 total
- **2,160× VL53L7CX**: ~$25,920-38,880 total  
- **540× Custom PCBs**: ~$8,100-13,500 total (design + assembly)
- **Enclosures & Hardware**: ~$2,700-8,100 total

### Manufacturing Partners:
- [ ] **PCB Fabrication**: Qualify 2-3 manufacturers for production runs
- [ ] **Assembly Service**: SMT assembly for volume production  
- [ ] **Testing Service**: Automated testing and programming
- [ ] **Quality Control**: Batch testing and certification procedures

### Lead Time Planning:
**PCB Fabrication**: 7-10 days (standard turnaround)  
**Component Assembly**: 5-7 days (automated SMT line)  
**Testing & Programming**: 2-3 days (batch processing)  
**Total Production**: 14-20 days for 540 nodes

---

## Budget Allocation (Week 8-13):

### Prototyping Costs:
**PCB Design & Layout**: $8,000-12,000  
**50× Prototype PCBs**: $2,500-5,000  
**Component Kit (50 sets)**: $8,000-15,000  
**Assembly & Testing**: $3,000-8,000  
**Design Tools & Equipment**: $2,000-5,000  

**Total Prototyping**: $23,500-45,000  

### Production Preparation:
**Manufacturing Setup**: $5,000-10,000  
**Quality Systems**: $3,000-8,000  
**Volume Component Deposits**: $10,000-25,000  

**Total Phase 1 Hardware**: $41,500-88,000 (within $80K-150K budget)

---

## Next Actions (Week 6):

1. **Schematic Design**: Begin STM32G071 + VL53L7CX circuit design
2. **Component Sourcing**: Order samples and development boards
3. **PCB Design Tools**: Set up KiCad or Altium Designer environment  
4. **Manufacturing Research**: Identify PCB fab and assembly partners
5. **Testing Equipment**: Acquire oscilloscope, logic analyzer, power supplies

**Critical Path**: PCB design completion by Week 8 for prototype fabrication