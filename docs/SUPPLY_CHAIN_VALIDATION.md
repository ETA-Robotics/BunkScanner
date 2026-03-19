# Component Supply Chain Validation
## BunkScanner Phase 1 - Week 5

**Status**: VALIDATION IN PROGRESS  
**Critical Path**: VL53L7CX sensor availability  

---

## Critical Components Analysis

### VL53L7CX Time-of-Flight Sensors
**Requirement**: 2,160 units (4 per node × 540 nodes)  
**Supplier**: STMicroelectronics  
**Estimated Cost**: $12-18 each = $25,920-38,880 total  

**Validation Tasks**:
- [ ] **Lead Time Check**: Contact ST distributors for current availability
- [ ] **Bulk Pricing**: Negotiate 2,000+ unit pricing (target <$15 each)
- [ ] **Alternative Sources**: Identify backup suppliers (Digi-Key, Mouser, Arrow)
- [ ] **Alternative Sensors**: Qualify TI OPT3101 as backup option

### STM32G071RBT6 Microcontrollers  
**Requirement**: 540 units (1 per sensor node)  
**Supplier**: STMicroelectronics  
**Estimated Cost**: $3-5 each = $1,620-2,700 total  

**Validation Tasks**:
- [ ] **Availability Check**: Confirm in-stock quantities at distributors
- [ ] **PCB Requirements**: Validate QFN-64 package for custom boards
- [ ] **Function Verification**: Confirm I2C, RS485, GPIO capabilities sufficient

### Arduino Opta Gateways
**Requirement**: 7 units (1 per bus)  
**Supplier**: Arduino (official)  
**Estimated Cost**: $150-200 each = $1,050-1,400 total  

**Validation Tasks**:
- [ ] **Availability**: Check Arduino official distributors  
- [ ] **Bulk Discount**: Inquire about 7+ unit pricing
- [ ] **Firmware Access**: Confirm programming/customization capabilities
- [ ] **Alternative**: Evaluate RPi + RS485 HAT option ($80-120 each)

---

## Supply Chain Risk Assessment

### HIGH RISK:
- **VL53L7CX sensors**: Single-source, high volume requirement (2,160 units)
- **Global chip shortage**: Semiconductor availability remains volatile

### MEDIUM RISK:  
- **STM32 MCUs**: Multiple package options, smaller volume
- **Arduino Opta**: New product, limited production history

### LOW RISK:
- **Passive components**: RS485 transceivers, connectors, power supplies
- **PCB fabrication**: Standard processes, multiple suppliers available

---

## Next Actions (Week 6):

1. **Contact STMicroelectronics** - Direct inquiry for 2,160 VL53L7CX units
2. **Distributor quotes** - Get formal quotes from 3+ electronics distributors  
3. **Alternative sensor testing** - Order samples of TI OPT3101 for comparison
4. **PCB design prep** - Begin STM32G071 custom board schematic
5. **Supplier diversification** - Identify backup sources for all components

---

## Budget Allocation:

**Component Research & Samples**: $2,000-5,000  
**Initial Prototype Components**: $8,000-15,000  
**Supply Chain Validation**: $1,000-3,000  

**Total Week 5-7**: $11,000-23,000 (within Phase 1 budget)