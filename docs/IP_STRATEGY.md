# BunkScanner IP Strategy & Patent Tracking
## Phase 1 - Intellectual Property Protection

**Status**: PRIOR ART REVIEW COMPLETE — FILING STRATEGY REVISED  
**Revision**: 2.0 — Updated with patent landscape findings (March 2026)  

---

## Prior Art Findings — Critical Issues

### AU2012245501B2 — Schneider Electric (AUTO-ADDRESSING)
**"System and method for automatically addressing devices in a multi-drop network"**  
- Filed: April 2012 | Granted: September 2016 | **ACTIVE**
- Jurisdictions: WO, EP, US, CN, AU, DK
- 25 claims, 41 citations, 64 cited-by

This patent covers automatic address assignment to devices on a shared Modbus/RS-485 bus. Schneider uses random dynamic address + collision detection. BunkScanner uses sequential GPIO daisy-chain (ADDR_IN/ADDR_OUT). The physical mechanism differs, but the functional outcome is identical: automatic address assignment on Modbus RS-485 without manual configuration.

**Impact**: Broad claims in AU2012245501B2 may read onto BunkScanner's approach. **FTO analysis is mandatory before filing Patent #2.**

### US10085419B2 — C-Lock Inc. (FEED MONITORING)
**"Modular livestock feed system for measuring animal intake and monitoring animal behavior"**  
- Filed: July 2016 | Granted: October 2018 | **ACTIVE**

Different approach (individual RFID-gated feed bins vs. open bunk ToF sensors), but the core function of automated feed level/intake monitoring in livestock operations overlaps.

### US7836849B2 — Micro Beef Technologies (BROAD PRIOR ART)
**"Cattle management method and system"**  
- Priority: October 1994 | Granted: November 2010 | Likely expired or expiring

Demonstrates automated feedlot management is not a new concept. 30+ years of prior art. Any broad claims around "automated feedlot monitoring" face prior art challenges.

### US11771057B2 — HerdX, Inc. (LIVESTOCK MANAGEMENT)
- Filed: December 2017 | Granted: October 2023 | **ACTIVE**
- Broad livestock management systems including water monitoring, health analytics
- Risk: LOW-MEDIUM. Different sensor approach.

### CN112653743A — Guangzhou Robustel (RS485 ADDRESSING)
- Filed: December 2020 | Published: April 2021
- Multi-sensor addressing on RS485 bus, sequential within subnets
- Risk: MEDIUM. Chinese patent; may not affect AU/US filing but shows concept is not novel.

---

## Revised Patent Strategy

### 1. Multi-Camera Fill Level Algorithm — PROCEED (Strongest Candidate)
**Technical Basis**: 4× VL53L7CX sensors per node with confidence scoring  
**Innovation**: Per-zone variance analysis + fault detection across 8×8 grid  
**Prior Art Status**: No direct prior art found for ToF multi-sensor feed level with confidence metrics  

**Patent Scope**:
- Multi-sensor feed level determination with confidence metrics
- 8×8 zone grid processing with missing sensor compensation
- Automatic variance-based mixing quality assessment
- Environmental contamination filtering (distance validation)

**Filing Priority**: IMMEDIATE — file after FTO clears  
**Estimated Cost**: $15,000-25,000  
**Recommendation**: Narrow claims to VL53L7CX-specific implementation in agricultural application

### 2. GPIO Daisy-Chain Auto-Addressing — HIGH RISK, DEFER
**Technical Basis**: ADDR_IN/ADDR_OUT sequential propagation  
**Prior Art Threat**: AU2012245501B2 (Schneider)  

**Action Required**:
1. Engage patent attorney for FTO analysis ($10K-15K)
2. Review Schneider's 25 claims against GPIO-specific mechanism
3. Determine if hardware-specific claims are patentable around Schneider's scope
4. File only if FTO is clear — otherwise protect as trade secret

**Filing Priority**: ON HOLD until FTO complete  
**Estimated Cost**: $10K-15K (FTO) + $12K-20K (filing, if cleared)  

### 3. Sensor Fusion Architecture — PROCEED WITH CAUTION
**Technical Basis**: VL53L7CX + backup sensor integration  
**Prior Art Status**: General concept well-known; no ag-specific ToF prior art found  

**Patent Scope**:
- Adaptive sensor fusion for time-of-flight distance measurement in agricultural settings
- Runtime sensor type detection and algorithm switching
- Cross-sensor reliability validation

**Filing Priority**: Week 12-14 (after Patent #1 filed)  
**Estimated Cost**: $10,000-18,000  
**Recommendation**: File narrow claims tied to agricultural ToF application

### 4. Predictive Feed Analytics — DROP FOR NOW
**Technical Basis**: Consumption pattern analysis + anomaly detection  
**Prior Art**: US7836849B2 shows 30 years of automated cattle data analysis  
**Software Patent Weakness**: Software patents are weak in Australia  

**Recommendation**: Save $8K-15K. Focus budget on hardware patents. Revisit if/when unique data patterns emerge from real deployments.

---

## Revised Patent Filing Timeline

| Priority | Patent Application | Cost | Status |
|----------|-------------------|------|--------|
| **1** | Multi-Camera Algorithm | $15K-25K | Ready to prep — strongest position |
| **2** | FTO Analysis (Schneider patent) | $10K-15K | **MUST DO BEFORE Patent #2 filing** |
| **3** | Auto-Addressing (if FTO clears) | $12K-20K | ON HOLD |
| **4** | Sensor Fusion | $10K-18K | Queue |
| ~~5~~ | ~~Predictive Analytics~~ | ~~$8K-15K~~ | DROPPED — weak case, save budget |

**Revised Total IP Investment**: $47,000-78,000 (includes FTO analysis)  
**If Auto-Addressing blocked**: $35,000-58,000 (patents #1 and #3 only + FTO cost)

---

## Trade Secrets (No Filing — Protect Internally)

- **Modbus protocol extensions**: Custom function codes (FC 0x41-0x43)
- **Calibration algorithms**: Bunk-specific measurements and offsets
- **Manufacturing processes**: PCB assembly and testing procedures
- **Auto-addressing protocol details**: If FTO blocks patent, protect as trade secret instead

## Copyright Protection
- **Source code**: All firmware and software under private ETA license
- **Documentation**: Installation guides, user manuals
- **Web interface**: Dashboard design and visualization

---

## Next Actions (This Week)

1. **Patent attorney**: Interview 3+ firms with ag-tech and IoT experience
2. **FTO analysis**: Priority engagement for AU2012245501B2 review
3. **Patent #1 prep**: Document multi-camera fill level algorithm in detail for filing
4. **Decision**: Auto-addressing — patent vs. trade secret (depends on FTO outcome)

**Critical**: Do not spend $12K-20K filing Patent #2 until the Schneider FTO analysis is complete.

---

*IP Strategy Version 2.0*  
*Revised: March 19, 2026*