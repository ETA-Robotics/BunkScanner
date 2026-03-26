# BunkScanner

Real-time feedlot bunk monitoring system with web-based dashboard for feed level tracking across multiple pen sections. Integrates with Arduino Opta hardware for industrial IoT data collection.

## Overview

BunkScanner provides:
- Real-time feed level monitoring across all pen sections
- Early detection of low feed conditions
- Feed consumption tracking and analytics
- Reduced manual inspection requirements
- Optimized feed distribution scheduling

## System Architecture

### Hardware
- Arduino Opta industrial IoT gateway
- Ultrasonic sensors (4 per 2.4m segment)
- WFLBT02 standard bunks (430mm depth)

### Software
- Web dashboard with SVG layout visualization
- Real-time data processing and alerts
- Development simulation environment

## Monitoring Coverage

The system monitors three main feedlot sections:

**D Side**: 8 pens (D1-D8), 280m total length  
**C Side**: 15 pens (C1-C15), 515m total length  
**B Side**: 20 pens (B1-B20), 500m total length

## Features

- Live feed level visualization with status indicators
- Low feed condition alerts and notifications
- Feed level trends and consumption analytics
- Interactive pen segment inspection
- Mobile-responsive interface
- 30-second data polling intervals

## Technical Specifications

- Segment length: 2.4m per monitored section
- Sensor density: 4 ultrasonic sensors per segment  
- Bunk depth: 430mm internal (WFLBT02)
- Update frequency: 30-second polling
- Layout resolution: 2990 × 1290 pixels

## Installation

### Requirements
- Web server (Apache/Nginx)
- Network access to Arduino Opta
- SVG-compatible web browser

### Setup
1. Deploy repository to web server
2. Configure Arduino Opta network settings
3. Update API endpoints in `Code/web/app.js`
4. Access web interface via server URL

## Project Structure

```
BunkScanner/
├── README.md                           # This file
├── LICENSE                             # Private ETA License
├── Code/                               # Application source code
│   ├── server.js                       # Express server entrypoint
│   ├── tests/                          # Main Jest test suite
│   ├── test/                           # Legacy protocol and API tests
│   ├── firmware/                       # STM32 node and Opta gateway firmware
│   ├── coverage/                       # Jest coverage output
│   ├── lib/                            # Shared backend modules
│   ├── tools/                          # Diagnostic and monitoring CLIs
│   └── web/                            # Web application
│       ├── index.html                  # Main dashboard interface
│       ├── app.js                      # Application logic and data processing
│       ├── style.css                   # User interface styling
│       ├── feedlot-layout.jpg          # Full feedlot overhead layout
│       └── feedlot-layout-crop.jpg     # Cropped layout for UI overlay
└── docs/                               # Planning and project documentation
```

## Usage

1. Access web dashboard
2. Monitor real-time feed levels via color indicators
3. Review alert notifications for low feed conditions
4. Click pen sections for detailed sensor readings
5. Track consumption trends and patterns

## Interface

- Green: Adequate feed levels (>70%)
- Yellow: Moderate feed levels (30-70%)
- Red: Low feed requiring attention (<30%)
- Alert counter shows active low-feed conditions
- Connection indicator displays hardware status

## License & Privacy

Proprietary system containing operational data and monitoring algorithms. Access restricted to authorized personnel and approved evaluation partners under Private ETA License terms.

## Support

Contact ETA Engineering Technologies Australia for technical support and configuration assistance.

---

© 2026 ETA Engineering Technologies Australia. All rights reserved.
