# Component Supply Chain Validation
## BunkScanner Phase 1

**Status**: VALIDATION IN PROGRESS — pricing updated with real-world data  
**Critical Path**: VL53L7CX sensor availability (single-source risk)  
**Revision**: 2.0 — March 2026  

---

## Critical Components Analysis

### VL53L7CX Time-of-Flight Sensors — HIGH RISK
**Requirement**: 2,992 units (4 per node × 748 nodes)  
**Manufacturer**: STMicroelectronics (sole source — no pin-compatible alternative exists)  

| Source | Qty 1 Price | Bulk (2,000+) | Lead Time |
|--------|------------|---------------|-----------|
| DigiKey | ~$10-12 USD | ~$8-10 | 8-16 weeks |
| Mouser | ~$10-12 USD | ~$8-10 | 8-16 weeks |
| ST Direct | Quote required | Est. $6-10 | 8-16 weeks |

**Estimated Total Cost**: $17,952-29,920 (at $6-10 bulk) — lower than previous estimate of $25,920-38,880

**Risk Factors**:
- **Single source**: ST Microelectronics is the only manufacturer. No alternative exists
- **TI OPT3101 is NOT a backup**: Different sensor type (active IR, not multi-zone ToF), different I2C interface, different data format. Requires complete firmware rewrite — not a drop-in replacement
- **Chip shortage volatility**: Semiconductor availability still fluctuates
- **Lead time**: 8-16 weeks means ordering must happen early in prototyping phase

**Mitigation**:
- Get formal quotes from 3+ distributors immediately
- Consider ordering pilot batch (200 units) now to secure supply
- Investigate ST's allocation/priority customer programs
- Accept single-source risk for now — no viable alternative for 8×8 multi-zone ToF

### STM32G071RBT6 Microcontrollers — LOW RISK
**Requirement**: 748 units (1 per sensor node)  
**Manufacturer**: STMicroelectronics  

| Source | Qty 1 Price | Bulk (500+) |
|--------|------------|-------------|
| Various distributors | $3-5 | $2-4 |

**Estimated Total Cost**: $1,496-2,992  
**Availability**: Widely stocked at multiple distributors  
**Package**: QFN-64 — standard, well-supported  
**Risk**: LOW. Multiple distributors, reasonable pricing, high availability.

### Arduino Opta Gateways — LOW-MEDIUM RISK
**Requirement**: 7 units (1 per bus)  
**Supplier**: Arduino (official)  

| Source | Price | Volume |
|--------|-------|--------|
| Arduino official | $150-180 | 7 units (trivial) |
| Alt: RPi + RS485 HAT | $80-120 | Viable backup |

**Estimated Total Cost**: $1,050-1,260  
**Risk**: LOW. Small quantity, multiple sourcing options.

---

## Supply Chain Risk Matrix

| Component | Qty | Single Source? | Risk | Mitigation |
|-----------|-----|---------------|------|------------|
| **VL53L7CX** | 2,992 | YES | **HIGH** | Order early, secure allocation |
| **STM32G071** | 748 | No (multiple distributors) | LOW | Standard procurement |
| **Arduino Opta** | 7 | No (RPi backup) | LOW | Trivial volume |
| **MAX485 transceiver** | 748 | No | LOW | Commodity part |
| **PCB fabrication** | 748+ | No (multiple fabs) | LOW | Standard 4-layer process |
| **Passive components** | Various | No | LOW | Commodity |
| **Connectors** | Various | No | LOW | Standard RJ45/terminal |

---

## Budget Summary (Corrected)

### Component Costs (Full 748-Node Deployment)
| Component | Quantity | Unit Cost | Total |
|-----------|----------|-----------|-------|
| VL53L7CX sensors | 2,992 | $6-10 | $17,952-29,920 |
| STM32G071 MCUs | 748 | $2-4 | $1,496-2,992 |
| Arduino Opta | 7 | $150-180 | $1,050-1,260 |
| Custom PCBs | 748 | $15-25 | $11,220-18,700 |
| Passives + connectors | Various | — | $3,000-6,000 |
| Enclosures + mounting | 748 | $5-15 | $3,740-11,220 |
| **Total** | | | **$38,458-70,092** |

### Phase 1 Procurement (50-Node Pilot)
| Item | Cost |
|------|------|
| Sensor samples (200 VL53L7CX) | $1,600-2,400 |
| MCU samples (50 STM32G071) | $150-250 |
| Prototype PCBs (50 boards) | $2,500-5,000 |
| Passives + connectors | $500-1,000 |
| **Pilot total** | **$4,750-8,650** |

---

## Next Actions

1. **Get formal VL53L7CX quotes** from ST direct, DigiKey, Mouser, Arrow — confirm lead time and bulk pricing for 200-unit pilot batch and 3,000-unit production
2. **Order pilot sensors** (200 units) as soon as pricing confirmed — lead time is the bottleneck
3. **Confirm STM32G071 availability** at distributors for 50-unit pilot
4. **PCB fabrication quotes** — identify 2-3 manufacturers for 4-layer prototype boards
5. **Drop TI OPT3101 as "backup"** — it is not a viable alternative. Accept single-source risk and focus on securing ST supply

---

*Supply Chain Validation Version 2.0*  
*Revised: March 19, 2026*