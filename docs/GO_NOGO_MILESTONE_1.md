# Go/No-Go Milestone 1 Checkpoint
## System Architecture & Component Validation

**Milestone Date**: March 26, 2026 (Week 8)  
**Phase**: R&D Week 5-7 Completion  
**Revision**: 2.0 — Corrected with honest assessment (March 2026)  

---

## Decision Criteria Matrix

### TECHNICAL VALIDATION

| Criteria | Target | Status | Honest Assessment |
|----------|--------|--------|-------------------|
| **Network Scalability** | 748 nodes | Code configured for 748 | **PARTIAL** — bus-diagnostic.js stress mode exists but no recorded test output in repo |
| **System Performance** | <100ms processing | bus-diagnostic claims 22ms | **UNVERIFIED** — no documented test results saved |
| **Bus Architecture** | 7 buses operational | 7 buses configured in code | **CODE ONLY** — untested on physical hardware |
| **API Integration** | REST API | Express.js server works | **PARTIAL** — skeleton only, no database, no auth, no historical storage |
| **Dashboard** | Real-time visualization | SVG renders correctly | **PARTIAL** — works but untested at 748-node scale |

**Technical Score**: Architecture is configured in code. No physical hardware validation yet. Firmware ~30% complete.

### COMPONENT AVAILABILITY

| Component | Quantity | Status | Risk |
|-----------|----------|--------|------|
| **VL53L7CX Sensors** | 2,992 units | No quotes obtained | **HIGH** — single source, 8-16 week lead time |
| **STM32G071 MCUs** | 748 units | Not ordered | **LOW** — widely available |
| **Arduino Opta** | 7 units | Not ordered | **LOW** — trivial volume |
| **PCB Components** | Various | No supplier quotes | **LOW** — commodity parts |

**Supply Chain Score**: No formal quotes obtained yet. VL53L7CX sourcing is the critical path.

### IP PROTECTION

| Item | Status | Finding |
|------|--------|---------|
| **Prior art search** | COMPLETED (preliminary) | Schneider AU2012245501B2 threatens Patent #2 |
| **Patent #1 (Multi-Camera)** | Ready to prep | Strongest candidate, no direct prior art found |
| **Patent #2 (Auto-Addressing)** | ON HOLD | Requires FTO analysis ($10K-15K) before filing |
| **Patent #3 (Sensor Fusion)** | Queued | Narrow claims, file after #1 |
| **Patent #4 (Predictive Analytics)** | DROPPED | Weak case, software patents poor in AU |
| **Attorney** | Not yet engaged | Need to interview firms |

**IP Score**: Prior art search revealed a significant threat. Budget may need to increase for FTO analysis.

### MARKET VALIDATION

| Market Factor | Status | Honest Assessment |
|---------------|--------|-------------------|
| **Barmount Partnership** | CONFIRMED | Real pilot site secured |
| **Customer Interest** | UNVALIDATED | No documented interest beyond Barmount |
| **Technical Differentiation** | STRONG | No competitor offers distributed ToF bunk monitoring |
| **Installation Capability** | ASSUMED | Barmount team not yet trained |

**Market Score**: Partnership is real. Customer demand beyond Barmount is assumed, not proven.

---

## Financial Status

### Phase 1 Budget Utilisation
**Total Allocated**: $80,000-150,000 (shared)  
**Spent to Date**: ~$15,000-25,000 (architecture work, documentation, IP research)  
**Remaining Budget**: $55,000-125,000  

### Upcoming Costs (Weeks 6-13)
| Item | Estimated Cost |
|------|---------------|
| FTO analysis (Schneider patent) | $10,000-15,000 |
| Patent #1 filing | $15,000-25,000 |
| VL53L7CX pilot order (200 units) | $1,600-2,400 |
| PCB design and prototyping | $17,600-33,400 |
| **Total upcoming** | **$44,200-75,800** |

**Financial Assessment**: Budget is sufficient for Phase 1 prototyping. FTO analysis is an unplanned expense that needs to be accommodated.

---

## Risk Assessment (Revised)

### HIGH RISKS
1. **VL53L7CX single-source dependency** — no pin-compatible alternative. If ST has supply problems, there is no Plan B
2. **Schneider patent (AU2012245501B2)** — broad claims on auto-addressing for Modbus/RS-485. FTO analysis required before spending $12K-20K on Patent #2
3. **Firmware completion** — ~30% done. Significant development remains: sensor driver, fusion algorithm, power management, watchdog

### MEDIUM RISKS
1. **No recorded stress test results** — "748 nodes in 22ms" claimed but no test output saved in repo
2. **No database or auth** — production system will need proper infrastructure
3. **PCB design not started** — first custom board, no prior production experience

### LOW RISKS
1. **STM32 availability** — commodity MCU, widely available
2. **Arduino Opta** — small quantity, backup options exist
3. **Market competition** — no direct competitors in distributed ToF bunk monitoring

---

## Go/No-Go Decision Framework

### GO Criteria (All must be met)
- [x] **Architecture configured**: 748-node network defined across 7 buses
- [x] **Partnership confirmed**: Barmount facility access and collaboration
- [ ] **Sensor supply confirmed**: VL53L7CX formal quotes and lead time verified
- [ ] **FTO initiated**: Patent attorney engaged for Schneider analysis
- [ ] **Financial commitment**: Both partners confirm continued investment

### NO-GO Triggers (Any one halts project)
- [ ] VL53L7CX sensors not available in required quantities within acceptable lead time
- [ ] Schneider patent blocks all auto-addressing approaches (assessed after FTO)
- [ ] Budget insufficient for FTO + prototyping combined
- [ ] Partnership terms cannot be agreed

---

## Recommendation

**Current Assessment**: CONDITIONAL GO

### What's strong
- Core technology concept (distributed ToF bunk monitoring) is genuinely novel
- No direct competitor in this space
- Barmount partnership provides real pilot site
- Budget is available for prototyping

### What needs to happen before Week 8 decision
1. **Get VL53L7CX quotes** — formal pricing and lead time from 3+ distributors
2. **Engage patent attorney** — start FTO analysis on Schneider patent
3. **Run and record stress test** — save actual test output to repo
4. **Order sensor samples** — lead time is the bottleneck

### What has changed since v1.0
- Node count aligned to 748 (from codebase, not 540)
- Sensor requirement now 2,992 (was 2,160)
- Prior art threat identified (Schneider auto-addressing patent)
- Predictive Analytics patent dropped (weak case)
- Financial projections revised downward to realistic levels
- Firmware assessed at ~30% complete, not near-complete

---

**Final Decision Point**: March 26, 2026  
**Next Phase (if GO)**: Hardware Prototyping (Week 8-13)  
**Investment Required**: $35,600-76,400 (prototype development)  
**Deliverable**: 50-node pilot system operational at Barmount facility

---

*Go/No-Go Checkpoint Version 2.0*  
*Revised: March 19, 2026*