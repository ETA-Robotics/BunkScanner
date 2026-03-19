# BunkScanner

A comprehensive feedlot bunk monitoring system designed for Barmount Feedlot operations. This web-based application provides real-time monitoring of feed levels across multiple pen sections using Arduino Opta hardware integration.

## 🎯 Purpose

BunkScanner enables feedlot operators to:
- Monitor feed levels across all pen sections in real-time
- Identify low feed conditions before they impact livestock
- Track feeding patterns and consumption rates
- Reduce manual inspection requirements
- Optimize feed distribution timing

## 🏗️ System Architecture

### Hardware Components
- **Arduino Opta**: Industrial IoT gateway for sensor data collection
- **Ultrasonic Sensors**: 4 sensors per 2.4m segment for accurate feed level measurement
- **WFLBT02 Bunks**: Standard 430mm depth feed bunks

### Software Components
- **Web Interface**: Real-time dashboard with SVG-based feedlot layout visualization
- **Data Processing**: Feed level calculations and alert generation
- **Mock Data Generator**: Development and testing simulation system

## 📊 Monitoring Coverage

The system monitors three main feedlot sections:

### D Side
- **8 Pens**: D1 through D8
- **Total Length**: 280 meters
- **Coverage**: Complete feed bunk monitoring

### C Side  
- **15 Pens**: C1 through C15
- **Total Length**: 515 meters
- **Coverage**: Extended pen section monitoring

### B Side
- **20 Pens**: B1 through B20  
- **Total Length**: 500 meters
- **Coverage**: High-density pen monitoring

## 🚀 Features

- **Real-time Dashboard**: Live feed level visualization with color-coded status indicators
- **Alert System**: Immediate notifications for low feed conditions
- **Historical Data**: Feed level trends and consumption patterns
- **Interactive Layout**: Click-to-inspect individual pen segments
- **Mobile Responsive**: Access monitoring data from any device
- **Automatic Updates**: 30-second polling interval for current data

## 🛠️ Technical Specifications

- **Segment Length**: 2.4 meters per monitored section
- **Sensor Density**: 4 ultrasonic sensors per segment
- **Bunk Specifications**: 430mm internal depth (WFLBT02 standard)
- **Update Frequency**: 30-second polling cycle
- **Layout Resolution**: 2990 × 1290 pixel precision mapping

## 🔧 Installation & Setup

### Prerequisites
- Web server (Apache/Nginx)
- Network connectivity to Arduino Opta hardware
- Modern web browser with SVG support

### Deployment
1. Clone this repository to your web server directory
2. Configure Arduino Opta with appropriate network settings
3. Update API endpoints in `web/app.js` for your hardware configuration
4. Access the web interface through your server's URL

## 📁 Project Structure

```
BunkScanner/
├── README.md                           # This file
├── LICENSE                             # Private ETA License
├── Bunk Volume Scanning Project/       # Project documentation
└── web/                                # Web application
    ├── index.html                      # Main dashboard interface
    ├── app.js                          # Application logic and data processing
    ├── style.css                       # User interface styling
    ├── feedlot-layout.jpg              # Full feedlot overhead layout
    └── feedlot-layout-crop.jpg         # Cropped layout for UI overlay
```

## 🔍 Usage

1. **Open Dashboard**: Navigate to the web interface
2. **Monitor Status**: View real-time feed levels with color indicators
3. **Review Alerts**: Check notification panel for low feed warnings  
4. **Inspect Segments**: Click individual pen sections for detailed readings
5. **Track Trends**: Monitor consumption patterns over time

## 🎨 Interface Elements

- **Green Segments**: Adequate feed levels (>70%)
- **Yellow Segments**: Moderate feed levels (30-70%)  
- **Red Segments**: Low feed requiring attention (<30%)
- **Alert Counter**: Dashboard summary of active low-feed conditions
- **Connection Status**: Real-time hardware connectivity indicator

## 🔒 Security & Privacy

This system contains proprietary feedlot operational data and monitoring algorithms. Access is restricted to authorized Barmount Feedlot personnel and approved evaluation partners under the terms of the Private ETA License.

## 📞 Support

For technical support, configuration assistance, or operational questions, contact the Barmount Feedlot technical team.

---

**BunkScanner** — Optimizing feedlot operations through intelligent monitoring  
© 2026 Barmount Feedlot. All rights reserved.