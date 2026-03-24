# BunkScanner 5-Year Strategic Plan
## ETA Engineering Technologies Australia + Barmount Feedlot Partnership

**Plan Period**: March 2026 - March 2031  
**Partnership Model**: Joint Venture with Shared Investment & Revenue  
**Revision**: 2.0 — Corrected against real-world data (March 2026)  

---

# EXECUTIVE SUMMARY

BunkScanner is a distributed Time-of-Flight sensor network for continuous feed bunk monitoring in feedlots. No competitor currently offers this specific solution. The technology is genuinely novel and sits in a market gap between expensive research-grade systems (GrowSafe, C-Lock at $50K-300K) and manual visual inspection.

This plan uses two projection tracks: a **bootstrap** scenario (self-funded growth) and a **venture-backed** scenario (with external capital raise). Previous projections have been revised downward to reflect comparable ag-tech company trajectories.

## Financial Projections Summary

| Year | Bootstrap | With VC ($5M+ raise) | Key Milestone |
|------|-----------|----------------------|---------------|
| **2026** | $100K-300K | $100K-300K | Barmount pilot + 1-2 early adopters |
| **2027** | $500K-1.5M | $1M-3M | SaaS platform, 8-12 installations |
| **2028** | $2M-5M | $4M-8M | US market entry, 25-40 installations |
| **2029** | $4M-8M | $8M-15M | International scale, 50-80 installations |
| **2030** | $8M-15M | $15M-30M | Strategic exit window opens |

*Context: Comparable ag-tech companies (Farmers Edge, Arable) took 10+ years to reach $20M ARR with $100M+ in funding.*

## Partnership Structure
- **ETA**: 68% — technology development, firmware, software, IP
- **Barmount**: 32% — market access, installation, field operations
- **Revenue sharing**: Varies by activity (system sales 60/40, installation 20/80)

---

# MARKET REALITY

## Australian Feedlot Market
- ~400-450 accredited feedlots (ALFA/MLA data)
- ~60-80 large feedlots (5,000+ head capacity)
- Total capacity: ~1.3 million head
- At $100K/installation: **$6M-8M total addressable market domestically**

## US Feedlot Market
- ~26,000 feedlots in the US
- ~2,000 with 1,000+ head capacity
- ~500 with 10,000+ head (primary targets)
- At $100K-200K/installation: **$100M-200M total addressable market**

## Global Precision Livestock Farming
- Published estimates: $3B-7B globally by 2028-2030
- Feed monitoring subsegment: $200M-500M
- Growth rate: 10-15% CAGR

**Bottom line**: The domestic market alone cannot support aggressive growth. US/international expansion is required for anything above $8M annual revenue, and that requires capital, regulatory compliance, and local partnerships.

---

# COMPETITIVE LANDSCAPE

| Competitor | Technology | Price Range | Key Difference |
|-----------|-----------|-------------|----------------|
| **GrowSafe** (Canada) | Load cells + RFID | $100K-300K | Per-animal research data; not operational monitoring |
| **C-Lock** (South Dakota) | Feed stations + gas sensors | $50K-200K | Research + emissions focus |
| **Digi-Star / Topcon** | Mixer scales, load cells | $5K-50K | Monitors feed delivery, not consumption |
| **HerdX** (Texas) | RFID, water monitoring | Varies | No feed bunk monitoring |
| **Micro Beef** (Texas) | RFID identification, sorting | Enterprise | Management system, not sensing |

**BunkScanner's gap**: Low-cost, continuous, non-contact bunk-level monitoring using distributed ToF sensors. No one else does this. The open question is whether feedlot operators will pay $50K-150K for something they currently handle with a person walking the bunks.

---

# YEAR 1 (2026): FOUNDATION

## Phase 1: R&D & Technology Development (Weeks 1-20)
**Timeline**: March - August 2026  
**Investment**: $80K-150K (shared)  

### Q1 2026: Partnership Formation & Architecture
- [x] **Partnership agreement**: Legal structure and revenue sharing
- [x] **System architecture**: 748-node network configured across 7 buses
- [ ] **Component validation**: VL53L7CX sensor sourcing (2,992 units for full deployment)
- [ ] **IP strategy**: Prior art search required before filing (see IP_STRATEGY.md)

### Q2 2026: Hardware Prototyping
- [ ] **PCB design**: STM32G071 custom sensor node boards (schematic not yet started)
- [ ] **50-node pilot**: Prototype system at Barmount facility
- [ ] **Auto-addressing**: GPIO daisy-chain hardware validation on physical nodes
- [ ] **Manufacturing**: Supply chain and assembly partners

### Current Development Status (Honest Assessment)
- **Backend server**: Express.js skeleton — works but has no database, no auth, no historical storage
- **Web dashboard**: SVG layout renders, untested at 748-node scale
- **Firmware**: ~30% complete — Modbus slave mock, auto-addressing protocol written but untested on hardware, VL53L7CX driver incomplete, sensor fusion not implemented
- **Stress test**: bus-diagnostic.js stress mode exists but no recorded test results in the repo

## Phase 2: Pilot Deployment & Customer Acquisition (Weeks 21-52)
**Timeline**: September 2026 - March 2027  
**Revenue Target**: $100K-300K  

### Q3 2026: Barmount Deployment
- [ ] **748-node installation**: Complete Barmount feedlot system across 43 pens
- [ ] **Customer pipeline**: Identify prospects through Barmount network
- [ ] **Installation team**: Barmount staff training and certification
- [ ] **Case studies**: Collect real performance data vs. manual bunk scoring

### Q4 2026: First Sales
- [ ] **1-2 additional installations**: Target large feedlots in Barmount's network
- [ ] **Revenue sharing**: Validate partnership financial model
- [ ] **System optimization**: Iterate on field performance issues

**Year 1 Target**: Barmount pilot operational + 1-2 paying customers. $100K-300K revenue.

---

# YEAR 2 (2027): MARKET ESTABLISHMENT

**Revenue Target**: $500K-1.5M (bootstrap) / $1M-3M (VC-backed)  
**Customer Target**: 8-12 installations  

### Market Expansion
- Expand beyond Barmount's immediate network via referrals and trade shows
- Target large Australian feedlots (5,000+ head)
- Begin SaaS platform development (subscription model $10K-20K/year per customer)

### Technology
- [ ] Cloud platform and mobile app for remote monitoring
- [ ] Feed consumption analytics and reporting
- [ ] API integrations with existing feed management software

### Adjacent Market Research
- [ ] Grain storage feasibility study
- [ ] Dairy silage monitoring assessment
- [ ] Water trough/lagoon level monitoring — determine if the hardware adapts

**Year 2 Target**: Establish repeatable sales process. SaaS infrastructure operational.

---

# YEAR 3 (2028): SCALING

**Revenue Target**: $2M-5M (bootstrap) / $4M-8M (VC-backed)  
**Customer Base**: 25-40 installations  

### US Market Entry
- ~500 US feedlots with 10,000+ head are primary targets
- Requires USDA/FDA regulatory compliance assessment
- Local distribution or partnership model needed
- Budget separately for US market development ($500K-1M)

### Product Portfolio
- **BunkScanner Pro**: Enhanced analytics tier
- **GrainScanner**: Only if grain storage feasibility confirmed in Year 2
- Each adjacent product requires its own R&D cycle and budget — not "free" extensions

### Partnerships
- Target integration partnerships with existing feed management platforms (not Cargill/John Deere direct — start with mid-tier software vendors)

---

# YEAR 4 (2029): EXPANSION

**Revenue Target**: $4M-8M (bootstrap) / $8M-15M (VC-backed)  
**Customer Base**: 50-80 installations globally  

### Platform Development
- Third-party integrations and API ecosystem
- Data licensing opportunities with research institutions
- Carbon footprint / sustainability monitoring features (growing regulatory demand)

### Technology
- Edge computing on gateway nodes for local analytics
- Investigate next-gen sensor options (reduce single-source VL53L7CX dependency)

---

# YEAR 5 (2030): STRATEGIC OPTIONS

**Revenue Target**: $8M-15M (bootstrap) / $15M-30M (VC-backed)  

### Exit Scenarios

| Scenario | Realistic Valuation | Notes |
|----------|---------------------|-------|
| **Strategic acquisition** | $40M-150M | Ag-tech typically acquired at 5-10x revenue |
| **Private equity** | $30M-80M | Growth capital for next stage |
| **Continue operating** | N/A | Profitable business, no exit required |

*Context: These valuations assume 5-10x revenue multiples, which is standard for ag-tech. Previous estimates of $300M-800M were not grounded in comparable transactions at these revenue levels.*

### ROI for Partners (Bootstrap Scenario)

| Partner | Investment | Year 5 Return (at 5-10x multiple) | ROI |
|---------|-----------|-----------------------------------|-----|
| **ETA** | $150K-300K | $24M-90M (68% of enterprise) | 80x-300x |
| **Barmount** | $75K-150K | $13M-48M (32% of enterprise) | 85x-320x |

An 80-300x return on a $150K-300K investment is still an outstanding outcome.

---

# RISKS

### Technology
- **VL53L7CX single-source**: No pin-compatible alternative exists. ST Microelectronics is the sole manufacturer
- **Firmware completion**: Significant development work remains (~30% done)
- **No database or auth**: Production system needs proper data infrastructure

### Market
- **Unvalidated demand**: No paying customer beyond Barmount yet
- **Agricultural purchasing cycles**: Seasonal (Sep-Mar in Australia)
- **Sales team**: Growing beyond 10 customers requires dedicated sales (not budgeted in Phase 1)

### IP
- **Schneider patent (AU2012245501B2)**: Covers auto-addressing on Modbus/RS-485 bus broadly. FTO analysis required before filing Patent #2
- **30 years of prior art**: Automated feedlot management (Micro Beef, 1994). Broad claims around "automated feedlot monitoring" face prior art challenges

### Financial
- **No SaaS infrastructure exists yet** — subscription revenue requires platform development investment
- **Adjacent market products** (GrainScanner, WaterScanner) each need their own R&D budget

---

# CONCLUSION

BunkScanner fills a genuine gap: low-cost, continuous feed bunk monitoring using distributed ToF sensors. No competitor offers this. The Barmount partnership provides a real pilot site and industry credibility. The core technology is strong.

The path to a $8M-15M business over 5 years (bootstrapped) is achievable and represents an excellent return. Growth beyond that requires capital, international expansion, and validated product-market fit beyond pilot deployments.

**Immediate priorities**:
1. Complete firmware and hardware prototyping
2. Get FTO analysis on the Schneider auto-addressing patent
3. Source VL53L7CX sensors and validate supply chain
4. Deploy and prove the Barmount pilot
5. Get first paying customer outside the partnership

---

*Strategic Plan Version 2.0*  
*Revised: March 19, 2026 — corrected against real-world data*  
*Next Review: September 2026 (6-month checkpoint)*