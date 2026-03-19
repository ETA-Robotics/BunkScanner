/* ============================================================
   BunkScanner — app.js
   Feedlot Bunk Monitoring System
   Barmount Feedlot · Arduino Opta Web UI

   Data model, mock generator, SVG renderer,
   interaction handlers, API stubs, state management
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     CONFIGURATION
     ---------------------------------------------------------- */
  const IMG_W = 2990;
  const IMG_H = 1290;
  const SEGMENT_LENGTH_M = 2.4;
  const SENSORS_PER_SEG = 4;
  const BUNK_DEPTH_MM = 430; // Internal depth (low side) of WFLBT02
  const POLL_INTERVAL_MS = 30000;

  /* ----------------------------------------------------------
     LAYOUT COORDINATES
     Pixel positions measured from the feedlot layout image
     (2990 × 1290).
     Each side has: y (top of bunk row), bunkH (visual height
     of the bunk strip on the map), and an array of pens with
     x start, width, and pen ID.
     ---------------------------------------------------------- */
  const LAYOUT = {
    D: {
      label: 'D Side',
      totalLength: 280,
      y: 461,
      bunkH: 16,
      labelPos: { x: 200, y: 415 },
      pens: [
        { id: 'D8',  x: 295,  w: 184 },
        { id: 'D7',  x: 479,  w: 131 },
        { id: 'D6',  x: 610,  w: 130 },
        { id: 'D5',  x: 740,  w: 133 },
        { id: 'D4',  x: 873,  w: 134 },
        { id: 'D3',  x: 1007, w: 129 },
        { id: 'D2',  x: 1136, w: 133 },
        { id: 'D1',  x: 1269, w: 133 },
      ]
    },
    C: {
      label: 'C Side',
      totalLength: 515,
      y: 479,
      bunkH: 16,
      labelPos: { x: 200, y: 505 },
      pens: [
        { id: 'C15', x: 297,  w: 180 },
        { id: 'C14', x: 477,  w: 133 },
        { id: 'C13', x: 610,  w: 131 },
        { id: 'C12', x: 741,  w: 134 },
        { id: 'C11', x: 875,  w: 130 },
        { id: 'C10', x: 1005, w: 132 },
        { id: 'C9',  x: 1137, w: 133 },
        { id: 'C8',  x: 1270, w: 134 },
        { id: 'C7',  x: 1404, w: 130 },
        { id: 'C6',  x: 1534, w: 133 },
        { id: 'C5',  x: 1667, w: 132 },
        { id: 'C4',  x: 1799, w: 131 },
        { id: 'C3',  x: 1930, w: 131 },
        { id: 'C2',  x: 2061, w: 134 },
        { id: 'C1',  x: 2195, w: 133 },
      ]
    },
    B: {
      label: 'B Side',
      totalLength: 500,
      y: 1010,
      bunkH: 16,
      labelPos: { x: 200, y: 950 },
      pens: [
        { id: 'B20', x: 368,  w: 100 },
        { id: 'B19', x: 468,  w: 99 },
        { id: 'B18', x: 567,  w: 97 },
        { id: 'B17', x: 664,  w: 100 },
        { id: 'B16', x: 764,  w: 102 },
        { id: 'B15', x: 866,  w: 96 },
        { id: 'B14', x: 962,  w: 95 },
        { id: 'B13', x: 1057, w: 100 },
        { id: 'B12', x: 1157, w: 99 },
        { id: 'B11', x: 1256, w: 98 },
        { id: 'B10', x: 1354, w: 99 },
        { id: 'B9',  x: 1453, w: 99 },
        { id: 'B8',  x: 1552, w: 98 },
        { id: 'B7',  x: 1650, w: 96 },
        { id: 'B6',  x: 1746, w: 101 },
        { id: 'B5',  x: 1847, w: 100 },
        { id: 'B4',  x: 1947, w: 96 },
        { id: 'B3',  x: 2043, w: 99 },
        { id: 'B2',  x: 2142, w: 99 },
        { id: 'B1',  x: 2241, w: 100 },
      ]
    },
    Z: {
      label: 'Z Side',
      totalLength: 500,
      y:1027,
      bunkH: 16,
      labelPos: { x: 200, y: 1065 },
      pens: [
        { id: 'Z10', x: 353,  w: 199 },
        { id: 'Z9',  x: 552,  w: 197 },
        { id: 'Z8',  x: 749,  w: 197 },
        { id: 'Z7',  x: 946,  w: 196 },
        { id: 'Z6',  x: 1142, w: 192 },
        { id: 'Z5',  x: 1334, w: 196 },
        { id: 'Z4',  x: 1530, w: 195 },
        { id: 'Z3',  x: 1725, w: 199 },
        { id: 'Z2',  x: 1924, w: 202 },
        { id: 'Z1',  x: 2126, w: 194 },
      ]
    }
  };

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */
  const state = {
    site: null,          // full site data
    selectedPenId: null,
    viewScope: 'site',   // site | side | pen
    sideFilter: 'all',   // all | D | C | B | Z
    aggregation: 'average', // average | worst | confidence
    timeWindow: 'live',
    density: 'standard', // overview | standard | detail
    thresholds: loadThresholds(),
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    notes: loadNotes(),
    viewSettings: loadViewSettings(),
    customDrawings: loadCustomDrawings(),
    referenceOutlines: createReferenceOutlines(),
    isDrawing: false,
    currentDrawing: null,
  };

  function loadThresholds() {
    try {
      const s = localStorage.getItem('bunkscanner_thresholds');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { empty: 10, low: 30, target: 75, high: 75, variance: 25 };
  }

  function saveThresholds() {
    localStorage.setItem('bunkscanner_thresholds', JSON.stringify(state.thresholds));
  }

  function loadNotes() {
    try {
      const s = localStorage.getItem('bunkscanner_notes');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return {};
  }

  function saveNotes() {
    localStorage.setItem('bunkscanner_notes', JSON.stringify(state.notes));
  }

  function loadViewSettings() {
    try {
      const s = localStorage.getItem('bunkscanner_view_settings');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { penOutlines: false, showBackground: true, drawingMode: false, showReferences: true };
  }

  function saveViewSettings() {
    localStorage.setItem('bunkscanner_view_settings', JSON.stringify(state.viewSettings));
  }

  function loadCustomDrawings() {
    try {
      const s = localStorage.getItem('bunkscanner_custom_drawings');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return [];
  }

  function saveCustomDrawings() {
    localStorage.setItem('bunkscanner_custom_drawings', JSON.stringify(state.customDrawings));
  }

  function createReferenceOutlines() {
    const referenceOutlines = [];

    // FULL PEN AREAS - More accurate pen depths and positioning
    for (const [sideKey, sideLayout] of Object.entries(LAYOUT)) {
      const sideColor = {
        'D': '#e74c3c', // Red
        'C': '#3498db', // Blue 
        'B': '#2ecc71', // Green
        'Z': '#f39c12'  // Orange
      }[sideKey];

      // Pen depths vary by side based on typical feedlot design
      const penDepth = {
        'D': 270, // D side pens extend north (reduced height)
        'C': 240, // C side pens extend south to central road
        'B': 230, // B side pens extend north (upward)
        'Z': 245  // Z side pens extend south (downward)
      }[sideKey];

      const penDirection = (sideKey === 'D' || sideKey === 'B') ? -1 : 1; // Direction from bunk

      sideLayout.pens.forEach((pen, index) => {
        // Full pen outline
        const penOutline = {
          id: `ref-pen-${pen.id}`,
          points: [
            { x: pen.x, y: sideLayout.y },
            { x: pen.x + pen.w, y: sideLayout.y },
            { x: pen.x + pen.w, y: sideLayout.y + sideLayout.bunkH + (penDepth * penDirection) },
            { x: pen.x, y: sideLayout.y + sideLayout.bunkH + (penDepth * penDirection) },
            { x: pen.x, y: sideLayout.y }
          ],
          isReference: true,
          color: sideColor,
          label: pen.id,
          type: 'pen'
        };
        referenceOutlines.push(penOutline);

        // Pen divider fences between adjacent pens
        if (index < sideLayout.pens.length - 1) {
          const fenceOutline = {
            id: `ref-fence-${pen.id}-${sideLayout.pens[index + 1].id}`,
            points: [
              { x: pen.x + pen.w, y: sideLayout.y },
              { x: pen.x + pen.w, y: sideLayout.y + sideLayout.bunkH + (penDepth * penDirection) },
              { x: pen.x + pen.w + 2, y: sideLayout.y + sideLayout.bunkH + (penDepth * penDirection) },
              { x: pen.x + pen.w + 2, y: sideLayout.y },
              { x: pen.x + pen.w, y: sideLayout.y }
            ],
            isReference: true,
            color: '#34495e',
            label: '',
            type: 'fence'
          };
          referenceOutlines.push(fenceOutline);
        }
      });
    }

    // MAIN ROADS (based on actual layout)
    const roadOutlines = [
      // Main truck haul road - shown prominently in layout
      {
        id: 'ref-truck-haul-road', 
        points: [
          { x: 280, y: 185 }, { x: 2350, y: 185 }, { x: 2350, y: 205 }, { x: 280, y: 205 }, { x: 280, y: 185 }
        ],
        isReference: true,
        color: '#2c3e50',
        label: 'TRUCK HAUL ROAD',
        type: 'road'
      },
      // Feed truck roads between pen rows
      {
        id: 'ref-feed-road-dc',
        points: [
          { x: 297, y: 461 }, { x: 2328, y: 461 }, { x: 2328, y: 479 }, { x: 297, y: 479 }, { x: 297, y: 461 }
        ],
        isReference: true,
        color: '#95a5a6',
        label: 'Feed Road D-C',
        type: 'road'
      },
      {
        id: 'ref-feed-road-bz',
        points: [
          { x: 297, y: 1010 }, { x: 2328, y: 1010 }, { x: 2328, y: 1027 }, { x: 297, y: 1027 }, { x: 297, y: 1010 }
        ],
        isReference: true,
        color: '#95a5a6',
        label: 'Feed Road B-Z',
        type: 'road'
      },
      // Central service road
      {
        id: 'ref-central-road',
        points: [
          { x: 250, y: 735 }, { x: 2450, y: 735 }, { x: 2450, y: 795 }, { x: 250, y: 795 }, { x: 250, y: 735 }
        ],
        isReference: true,
        color: '#7f8c8d',
        label: 'Central Road',
        type: 'road'
      }
    ];

    // DETAILED FACILITY BUILDINGS
    const facilityOutlines = [
      // Feed mill complex (detailed)
      {
        id: 'ref-feed-mill-main',
        points: [
          { x: 60, y: 60 }, { x: 160, y: 60 }, { x: 160, y: 150 }, { x: 60, y: 150 }, { x: 60, y: 60 }
        ],
        isReference: true,
        color: '#8e44ad',
        label: 'Feed Mill',
        type: 'building'
      },
      // Feed storage silos (multiple)
      {
        id: 'ref-silo-1',
        points: [
          { x: 170, y: 70 }, { x: 200, y: 70 }, { x: 200, y: 100 }, { x: 170, y: 100 }, { x: 170, y: 70 }
        ],
        isReference: true,
        color: '#9b59b6',
        label: 'Silo 1',
        type: 'building'
      },
      {
        id: 'ref-silo-2',
        points: [
          { x: 210, y: 70 }, { x: 240, y: 70 }, { x: 240, y: 100 }, { x: 210, y: 100 }, { x: 210, y: 70 }
        ],
        isReference: true,
        color: '#9b59b6',
        label: 'Silo 2',
        type: 'building'
      },
      // Office complex
      {
        id: 'ref-office-main',
        points: [
          { x: 60, y: 160 }, { x: 140, y: 160 }, { x: 140, y: 200 }, { x: 60, y: 200 }, { x: 60, y: 160 }
        ],
        isReference: true,
        color: '#e67e22',
        label: 'Office',
        type: 'building'
      },
      // Equipment/maintenance shed 
      {
        id: 'ref-maintenance-shed',
        points: [
          { x: 60, y: 160 }, { x: 180, y: 160 }, { x: 180, y: 220 }, { x: 60, y: 220 }, { x: 60, y: 160 }
        ],
        isReference: true,
        color: '#d35400',
        label: 'Maintenance Shed',
        type: 'building'
      },
      // Feed storage shed
      {
        id: 'ref-feed-storage-shed',
        points: [
          { x: 150, y: 230 }, { x: 250, y: 230 }, { x: 250, y: 270 }, { x: 150, y: 270 }, { x: 150, y: 230 }
        ],
        isReference: true,
        color: '#8d6e63',
        label: 'Feed Storage',
        type: 'building'
      },
      // Scale house (near truck haul road)
      {
        id: 'ref-scale-house',
        points: [
          { x: 2350, y: 300 }, { x: 2400, y: 300 }, { x: 2400, y: 330 }, { x: 2350, y: 330 }, { x: 2350, y: 300 }
        ],
        isReference: true,
        color: '#16a085',
        label: 'Scale House',
        type: 'building'
      },
      {
        id: 'ref-truck-scales',
        points: [
          { x: 2420, y: 230 }, { x: 2530, y: 230 }, { x: 2530, y: 250 }, { x: 2420, y: 250 }, { x: 2420, y: 230 }
        ],
        isReference: true,
        color: '#1abc9c',
        label: 'Truck Scales',
        type: 'infrastructure'
      },
      // Cattle handling facilities
      {
        id: 'ref-chutes-1',
        points: [
          { x: 2450, y: 400 }, { x: 2550, y: 400 }, { x: 2550, y: 500 }, { x: 2450, y: 500 }, { x: 2450, y: 400 }
        ],
        isReference: true,
        color: '#c0392b',
        label: 'Loading Chutes',
        type: 'infrastructure'
      },
      {
        id: 'ref-working-pens',
        points: [
          { x: 2450, y: 500 }, { x: 2600, y: 500 }, { x: 2600, y: 650 }, { x: 2450, y: 650 }, { x: 2450, y: 500 }
        ],
        isReference: true,
        color: '#e74c3c',
        label: 'Working Pens',
        type: 'infrastructure'
      }
    ];


    // ADDITIONAL INFRASTRUCTURE
    const additionalOutlines = [
      // Equipment storage
      {
        id: 'ref-equipment-storage',
        points: [
          { x: 60, y: 210 }, { x: 180, y: 210 }, { x: 180, y: 270 }, { x: 60, y: 270 }, { x: 60, y: 210 }
        ],
        isReference: true,
        color: '#795548',
        label: 'Equipment Storage',
        type: 'building'
      },
      // Feed commodity storage
      {
        id: 'ref-commodity-storage',
        points: [
          { x: 190, y: 210 }, { x: 280, y: 210 }, { x: 280, y: 270 }, { x: 190, y: 270 }, { x: 190, y: 210 }
        ],
        isReference: true,
        color: '#8d6e63',
        label: 'Commodity Storage',
        type: 'building'
      },
      // Electrical infrastructure
      {
        id: 'ref-electrical',
        points: [
          { x: 2750, y: 300 }, { x: 2780, y: 300 }, { x: 2780, y: 350 }, { x: 2750, y: 350 }, { x: 2750, y: 300 }
        ],
        isReference: true,
        color: '#f39c12',
        label: 'Electrical',
        type: 'infrastructure'
      }
    ];

    // Combine all reference elements
      referenceOutlines.push(...roadOutlines, ...facilityOutlines, ...additionalOutlines);
    
    return referenceOutlines;
  }

  /* ----------------------------------------------------------
     MOCK DATA GENERATOR
     ---------------------------------------------------------- */

  function generateSiteData() {
    const site = { sides: {}, timestamp: Date.now() };
    for (const [sideKey, sideLayout] of Object.entries(LAYOUT)) {
      const side = {
        id: sideKey,
        label: sideLayout.label,
        pens: [],
      };
      for (const penLayout of sideLayout.pens) {
        const pen = generatePen(penLayout, sideKey, sideLayout);
        side.pens.push(pen);
      }
      site.sides[sideKey] = side;
    }
    return site;
  }

  function generatePen(penLayout, sideKey, sideLayout) {
    // Estimate bunk length per pen from its pixel width relative to total
    const ratio = penLayout.w / sideLayout.pens.reduce((s, p) => s + p.w, 0);
    const bunkLengthM = Math.round(sideLayout.totalLength * ratio);
    const numSegments = Math.max(2, Math.round(bunkLengthM / SEGMENT_LENGTH_M));

    // Pick a pattern for this pen
    const pattern = pickPattern();
    const segments = [];

    for (let i = 0; i < numSegments; i++) {
      const seg = generateSegment(penLayout.id, i, numSegments, pattern);
      segments.push(seg);
    }

    const allFills = segments.map(s => s.fillPct);
    const avgFill = allFills.reduce((a, b) => a + b, 0) / allFills.length;
    const minFill = Math.min(...allFills);
    const maxFill = Math.max(...allFills);
    const healthySensors = segments.reduce((t, s) =>
      t + s.sensors.filter(sn => sn.health === 'ok').length, 0);
    const totalSensors = segments.length * SENSORS_PER_SEG;

    return {
      id: penLayout.id,
      side: sideKey,
      bunkLengthM: bunkLengthM,
      segments: segments,
      avgFill: Math.round(avgFill),
      minFill: Math.round(minFill),
      maxFill: Math.round(maxFill),
      healthScore: Math.round((healthySensors / totalSensors) * 100),
      lastUpdate: Date.now() - Math.floor(Math.random() * 120000),
      lastFeedEvent: Date.now() - Math.floor(Math.random() * 14400000),
      alerts: generateAlerts(penLayout.id, segments),
      trend: generateTrend(),
    };
  }

  function pickPattern() {
    const r = Math.random();
    if (r < 0.15) return 'empty';       // 15% recently emptied or very low
    if (r < 0.30) return 'low-gradient'; // 15% low with gradient
    if (r < 0.65) return 'target';       // 35% at target — majority
    if (r < 0.80) return 'high';         // 15% recently fed, high
    if (r < 0.90) return 'uneven';       // 10% inconsistent fill
    if (r < 0.95) return 'fault';        // 5% has sensor faults
    return 'target';
  }

  function generateSegment(penId, segIdx, totalSegs, pattern) {
    let basePct;
    switch (pattern) {
      case 'empty':
        basePct = 3 + Math.random() * 12;
        break;
      case 'low-gradient':
        basePct = 15 + (segIdx / totalSegs) * 25 + (Math.random() - 0.5) * 10;
        break;
      case 'target':
        basePct = 40 + Math.random() * 30;
        break;
      case 'high':
        basePct = 70 + Math.random() * 25;
        break;
      case 'uneven':
        basePct = segIdx % 2 === 0 ? 25 + Math.random() * 20 : 55 + Math.random() * 25;
        break;
      case 'fault':
        basePct = 40 + Math.random() * 30;
        break;
      default:
        basePct = 50;
    }

    basePct = clamp(basePct, 0, 100);

    const sensors = [];
    let hasFault = false;
    for (let s = 0; s < SENSORS_PER_SEG; s++) {
      const isFaulty = pattern === 'fault' && s === 2 && segIdx === 1;
      if (isFaulty) hasFault = true;
      const sensorPct = isFaulty ? null : clamp(basePct + (Math.random() - 0.5) * 12, 0, 100);
      sensors.push({
        id: `${penId}-S${segIdx + 1}-${s + 1}`,
        fillPct: sensorPct !== null ? Math.round(sensorPct * 10) / 10 : null,
        rawMm: sensorPct !== null ? Math.round((sensorPct / 100) * BUNK_DEPTH_MM) : null,
        health: isFaulty ? 'fault' : (Math.random() > 0.97 ? 'degraded' : 'ok'),
        lastUpdate: Date.now() - Math.floor(Math.random() * 60000),
      });
    }

    const validSensors = sensors.filter(s => s.fillPct !== null);
    const fillPct = validSensors.length > 0
      ? validSensors.reduce((a, s) => a + s.fillPct, 0) / validSensors.length
      : null;

    const variance = validSensors.length > 1
      ? Math.max(...validSensors.map(s => s.fillPct)) - Math.min(...validSensors.map(s => s.fillPct))
      : 0;

    return {
      id: `${penId}-S${segIdx + 1}`,
      index: segIdx,
      fillPct: fillPct !== null ? Math.round(fillPct * 10) / 10 : null,
      variance: Math.round(variance * 10) / 10,
      sensors: sensors,
      hasFault: hasFault,
      confidence: hasFault ? 'low' : (validSensors.length >= 3 ? 'high' : 'medium'),
    };
  }

  function generateAlerts(penId, segments) {
    const alerts = [];
    const now = Date.now();

    for (const seg of segments) {
      if (seg.fillPct !== null && seg.fillPct < state.thresholds.empty) {
        alerts.push({
          type: 'urgent',
          text: `${seg.id}: bunk empty (${seg.fillPct}%)`,
          time: now - Math.floor(Math.random() * 3600000),
        });
      } else if (seg.fillPct !== null && seg.fillPct < state.thresholds.low) {
        alerts.push({
          type: 'warning',
          text: `${seg.id}: feed low (${seg.fillPct}%)`,
          time: now - Math.floor(Math.random() * 7200000),
        });
      }
      if (seg.hasFault) {
        alerts.push({
          type: 'warning',
          text: `${seg.id}: sensor fault detected`,
          time: now - Math.floor(Math.random() * 1800000),
        });
      }
      if (seg.variance > state.thresholds.variance) {
        alerts.push({
          type: 'info',
          text: `${seg.id}: uneven fill (±${seg.variance}%)`,
          time: now - Math.floor(Math.random() * 5400000),
        });
      }
    }

    alerts.sort((a, b) => b.time - a.time);
    return alerts.slice(0, 8);
  }

  function generateTrend() {
    // 24h of data points, one per hour
    const points = [];
    let val = 30 + Math.random() * 40;
    const now = Date.now();
    for (let h = 23; h >= 0; h--) {
      // Simulate feed events as jumps
      if (Math.random() < 0.08) val = clamp(val + 25 + Math.random() * 20, 0, 100);
      val += (Math.random() - 0.6) * 5; // gradual decline
      val = clamp(val, 0, 100);
      points.push({
        time: now - h * 3600000,
        value: Math.round(val * 10) / 10,
      });
    }
    return points;
  }

  function updateSiteData() {
    // Small incremental changes to existing data
    if (!state.site) return;
    state.site.timestamp = Date.now();
    for (const side of Object.values(state.site.sides)) {
      for (const pen of side.pens) {
        for (const seg of pen.segments) {
          for (const sensor of seg.sensors) {
            if (sensor.fillPct === null) continue;
            sensor.fillPct = clamp(sensor.fillPct + (Math.random() - 0.55) * 2, 0, 100);
            sensor.fillPct = Math.round(sensor.fillPct * 10) / 10;
            sensor.rawMm = Math.round((sensor.fillPct / 100) * BUNK_DEPTH_MM);
            sensor.lastUpdate = Date.now();
          }
          // Recalc segment aggregate
          const valid = seg.sensors.filter(s => s.fillPct !== null);
          if (valid.length > 0) {
            seg.fillPct = Math.round(
              (valid.reduce((a, s) => a + s.fillPct, 0) / valid.length) * 10
            ) / 10;
            seg.variance = Math.round(
              (Math.max(...valid.map(s => s.fillPct)) -
               Math.min(...valid.map(s => s.fillPct))) * 10
            ) / 10;
          }
        }
        // Recalc pen stats
        const fills = pen.segments.filter(s => s.fillPct !== null).map(s => s.fillPct);
        if (fills.length) {
          pen.avgFill = Math.round(fills.reduce((a, b) => a + b, 0) / fills.length);
          pen.minFill = Math.round(Math.min(...fills));
          pen.maxFill = Math.round(Math.max(...fills));
        }
        pen.lastUpdate = Date.now();
        // Update trend (add one point, scroll)
        pen.trend.push({ time: Date.now(), value: pen.avgFill });
        if (pen.trend.length > 48) pen.trend.shift();
        // Regenerate alerts
        pen.alerts = generateAlerts(pen.id, pen.segments);
      }
    }
  }

  /* ----------------------------------------------------------
     FILL STATE CLASSIFICATION
     ---------------------------------------------------------- */

  function classifyFill(pct, variance) {
    if (pct === null) return 'nodata';
    if (variance > state.thresholds.variance) return 'inconsistent';
    if (pct < state.thresholds.empty) return 'empty';
    if (pct < state.thresholds.low) return 'low';
    if (pct <= state.thresholds.target) return 'target';
    return 'high';
  }

  function classifyFillForSeg(seg) {
    if (seg.hasFault && seg.confidence === 'low') return 'fault';
    return classifyFill(seg.fillPct, seg.variance);
  }

  /* ----------------------------------------------------------
     SVG RENDERING
     ---------------------------------------------------------- */
  const svgNS = 'http://www.w3.org/2000/svg';
  let segElements = {};  // segId -> <rect> element

  function buildSvgOverlay() {
    const svg = document.getElementById('mapSvg');
    svg.setAttribute('viewBox', `0 0 ${IMG_W} ${IMG_H}`);
    svg.innerHTML = '';
    segElements = {};

    for (const [sideKey, sideLayout] of Object.entries(LAYOUT)) {
      const sideGroup = document.createElementNS(svgNS, 'g');
      sideGroup.classList.add('side-group');
      sideGroup.dataset.side = sideKey;

      // Side label
      const sideLabel = document.createElementNS(svgNS, 'text');
      sideLabel.classList.add('side-label');
      sideLabel.setAttribute('x', sideLayout.labelPos.x);
      sideLabel.setAttribute('y', sideLayout.labelPos.y);
      sideLabel.textContent = sideLayout.label.toUpperCase();
      sideGroup.appendChild(sideLabel);

      const sidePens = state.site.sides[sideKey].pens;
      for (let pi = 0; pi < sidePens.length; pi++) {
        const pen = sidePens[pi];
        const penLayout = sideLayout.pens[pi];
        const penGroup = document.createElementNS(svgNS, 'g');
        penGroup.classList.add('pen-group');
        penGroup.dataset.pen = pen.id;

        // Add pen outline if enabled
        if (state.viewSettings.penOutlines) {
          const penOutline = document.createElementNS(svgNS, 'rect');
          penOutline.setAttribute('x', penLayout.x - 2);
          penOutline.setAttribute('y', sideLayout.y - 2);
          penOutline.setAttribute('width', penLayout.w + 4);
          penOutline.setAttribute('height', sideLayout.bunkH + 4);
          penOutline.setAttribute('rx', 3);
          penOutline.classList.add('pen-outline');
          penOutline.style.fill = 'none';
          penOutline.style.stroke = 'var(--text)';
          penOutline.style.strokeWidth = '2';
          penOutline.style.strokeDasharray = '5,3';
          penOutline.style.opacity = '0.7';
          penGroup.appendChild(penOutline);
        }

        // Pen label
        const penLabel = document.createElementNS(svgNS, 'text');
        penLabel.classList.add('pen-label');
        penLabel.setAttribute('x', penLayout.x + penLayout.w / 2);
        penLabel.setAttribute('y', sideLayout.y - 6);
        penLabel.textContent = pen.id;
        penGroup.appendChild(penLabel);

        // Segment rects
        const segW = penLayout.w / pen.segments.length;
        for (let si = 0; si < pen.segments.length; si++) {
          const seg = pen.segments[si];
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', penLayout.x + si * segW);
          
          // Position sensor readings: within pen boundaries
          let sensorY;
          if (sideKey === 'C') {
            // Bottom of C row (within pen area, near central road)
            sensorY = sideLayout.y + sideLayout.bunkH + 220;
          } else if (sideKey === 'D') {
            // Top of D row (within pen area, near far end)
            sensorY = sideLayout.y - 250;
          } else if (sideKey === 'B') {
            // Top of B row (within pen area, near far end)  
            sensorY = sideLayout.y - 140;
          } else {
            // Default for any other rows
            sensorY = sideLayout.y;
          }
          rect.setAttribute('y', sensorY);
          
          rect.setAttribute('width', segW);
          rect.setAttribute('height', sideLayout.bunkH);
          rect.setAttribute('rx', 1);
          const fillState = classifyFillForSeg(seg);
          rect.classList.add('bunk-seg', `bunk-seg--${fillState}`);
          if (seg.hasFault || (seg.fillPct !== null && seg.fillPct < state.thresholds.empty)) {
            rect.classList.add('bunk-seg--alert');
          }
          rect.dataset.seg = seg.id;
          rect.dataset.pen = pen.id;
          rect.dataset.side = sideKey;
          penGroup.appendChild(rect);
          segElements[seg.id] = rect;
        }

        sideGroup.appendChild(penGroup);
      }

      svg.appendChild(sideGroup);
    }

    // Add custom drawings and reference outlines
    renderCustomDrawings();
  }

  function updateSegmentColors() {
    if (!state.site) return;
    for (const side of Object.values(state.site.sides)) {
      for (const pen of side.pens) {
        for (const seg of pen.segments) {
          const el = segElements[seg.id];
          if (!el) continue;
          // Remove old fill classes
          el.classList.remove(
            'bunk-seg--empty', 'bunk-seg--low', 'bunk-seg--target',
            'bunk-seg--high', 'bunk-seg--inconsistent', 'bunk-seg--fault',
            'bunk-seg--nodata', 'bunk-seg--alert'
          );
          const fillState = classifyFillForSeg(seg);
          el.classList.add(`bunk-seg--${fillState}`);
          if (seg.hasFault || (seg.fillPct !== null && seg.fillPct < state.thresholds.empty)) {
            el.classList.add('bunk-seg--alert');
          }
        }
      }
    }
  }

  /* ----------------------------------------------------------
     SIDE FILTER VISIBILITY
     ---------------------------------------------------------- */
  function applySideFilter() {
    const groups = document.querySelectorAll('.side-group');
    groups.forEach(g => {
      if (state.sideFilter === 'all' || g.dataset.side === state.sideFilter) {
        g.style.opacity = '1';
        g.style.pointerEvents = 'auto';
      } else {
        g.style.opacity = '0.15';
        g.style.pointerEvents = 'none';
      }
    });
  }

  /* ----------------------------------------------------------
     SUMMARY BAR
     ---------------------------------------------------------- */
  function updateSummary() {
    if (!state.site) return;
    let pens = 0, segments = 0, alerts = 0, lowCount = 0, faults = 0;

    for (const side of Object.values(state.site.sides)) {
      for (const pen of side.pens) {
        pens++;
        segments += pen.segments.length;
        alerts += pen.alerts.length;
        if (pen.avgFill < state.thresholds.low) lowCount++;
        for (const seg of pen.segments) {
          if (seg.hasFault) faults++;
        }
      }
    }

    document.getElementById('sumPens').textContent = pens;
    document.getElementById('sumSegments').textContent = segments;
    document.getElementById('sumAlerts').textContent = alerts;
    document.getElementById('sumLow').textContent = lowCount;
    document.getElementById('sumFaults').textContent = faults;
    document.getElementById('headerTimestamp').textContent = formatTime(state.site.timestamp);
  }

  /* ----------------------------------------------------------
     DETAIL PANEL
     ---------------------------------------------------------- */

  function openDetail(penId) {
    state.selectedPenId = penId;
    const pen = findPen(penId);
    if (!pen) return;

    const panel = document.getElementById('detailPanel');
    panel.classList.add('detail-panel--open');

    // Highlight selected pen on map
    Object.values(segElements).forEach(el => el.classList.remove('bunk-seg--selected'));
    for (const seg of pen.segments) {
      const el = segElements[seg.id];
      if (el) el.classList.add('bunk-seg--selected');
    }

    renderDetail(pen);
  }

  function closeDetail() {
    state.selectedPenId = null;
    document.getElementById('detailPanel').classList.remove('detail-panel--open');
    Object.values(segElements).forEach(el => el.classList.remove('bunk-seg--selected'));
  }

  function renderDetail(pen) {
    // Header
    document.getElementById('dpPenName').textContent = pen.id;
    document.getElementById('dpSideBadge').textContent = pen.side + ' Side';

    // Stats
    document.getElementById('dpAvgFill').textContent = pen.avgFill + '%';
    document.getElementById('dpMinMax').textContent = pen.minFill + '–' + pen.maxFill + '%';
    document.getElementById('dpHealth').textContent = pen.healthScore + '%';

    // Color the avg fill stat
    const avgEl = document.getElementById('dpAvgFill');
    avgEl.style.color = `var(--fill-${classifyFill(pen.avgFill, 0)})`;

    // Fill profile strip
    const profileEl = document.getElementById('dpFillProfile');
    profileEl.innerHTML = '';
    pen.segments.forEach((seg, i) => {
      const div = document.createElement('div');
      div.className = 'fill-profile__seg';
      const fillState = classifyFillForSeg(seg);
      div.style.background = `var(--fill-${fillState})`;
      div.title = `Seg ${i + 1}: ${seg.fillPct !== null ? seg.fillPct + '%' : 'No data'}`;
      div.dataset.segIdx = i;
      div.addEventListener('click', () => expandSegCard(i));
      profileEl.appendChild(div);
    });

    // Segment list
    const segListEl = document.getElementById('dpSegList');
    segListEl.innerHTML = '';
    pen.segments.forEach((seg, i) => {
      const card = buildSegCard(seg, i);
      segListEl.appendChild(card);
    });

    // Trend
    drawTrend(pen.trend);

    // Alerts
    const alertsEl = document.getElementById('dpAlerts');
    alertsEl.innerHTML = '';
    if (pen.alerts.length === 0) {
      alertsEl.innerHTML = '<div class="alert-row"><div class="alert-dot"></div><span class="alert-row__text" style="color:var(--text-muted)">No active alerts</span></div>';
    } else {
      pen.alerts.forEach(a => {
        const row = document.createElement('div');
        row.className = 'alert-row';
        row.innerHTML = `
          <div class="alert-dot alert-dot--${a.type}"></div>
          <span class="alert-row__text">${escapeHtml(a.text)}</span>
          <span class="alert-row__time">${formatTimeAgo(a.time)}</span>
        `;
        alertsEl.appendChild(row);
      });
    }

    // Timestamps
    document.getElementById('dpLastUpdate').textContent = formatTime(pen.lastUpdate);
    document.getElementById('dpLastFeed').textContent = formatTimeAgo(pen.lastFeedEvent);

    // Notes
    const notesEl = document.getElementById('dpNotes');
    notesEl.value = state.notes[pen.id] || '';
  }

  function buildSegCard(seg, idx) {
    const card = document.createElement('div');
    card.className = 'seg-card';
    card.dataset.segIdx = idx;

    const fillState = classifyFillForSeg(seg);
    const header = document.createElement('div');
    header.className = 'seg-card__header';
    header.innerHTML = `
      <div class="seg-card__status" style="background:var(--fill-${fillState})"></div>
      <span class="seg-card__name">Seg ${idx + 1}</span>
      <span class="seg-card__reading">${seg.fillPct !== null ? seg.fillPct + '%' : '—'}</span>
      <span class="seg-card__confidence">${seg.confidence}</span>
    `;
    header.addEventListener('click', () => card.classList.toggle('seg-card--expanded'));

    const body = document.createElement('div');
    body.className = 'seg-card__body';

    // Sensor grid
    const grid = document.createElement('div');
    grid.className = 'sensor-grid';
    seg.sensors.forEach(sensor => {
      const cell = document.createElement('div');
      const healthCls = sensor.health === 'ok' ? '' : (sensor.health === 'degraded' ? 'sensor-cell--warn' : 'sensor-cell--fault');
      cell.className = `sensor-cell ${healthCls}`;
      cell.innerHTML = `
        <div class="sensor-cell__id">${escapeHtml(sensor.id.split('-').pop())}</div>
        <div class="sensor-cell__val">${sensor.fillPct !== null ? sensor.fillPct + '%' : '—'}</div>
        <div class="sensor-cell__health" style="color:${sensor.health === 'ok' ? 'var(--fill-target)' : (sensor.health === 'degraded' ? 'var(--fill-low)' : 'var(--fill-empty)')}">${sensor.health}</div>
      `;
      grid.appendChild(cell);
    });
    body.appendChild(grid);

    // Segment stats
    const stats = document.createElement('div');
    stats.style.cssText = 'margin-top:8px;font-size:11px;color:var(--text-secondary);display:flex;gap:12px;';
    stats.innerHTML = `
      <span>Variance: <b>${seg.variance}%</b></span>
      <span>Raw: <b>${seg.fillPct !== null ? Math.round((seg.fillPct / 100) * BUNK_DEPTH_MM) + 'mm' : '—'}</b></span>
    `;
    body.appendChild(stats);

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function expandSegCard(idx) {
    const cards = document.querySelectorAll('.seg-card');
    cards.forEach((c, i) => {
      if (i === idx) c.classList.add('seg-card--expanded');
      else c.classList.remove('seg-card--expanded');
    });
    // Scroll to card
    cards[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ----------------------------------------------------------
     TREND SPARKLINE (Canvas)
     ---------------------------------------------------------- */
  function drawTrend(points) {
    const canvas = document.getElementById('dpTrendCanvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    if (!points || points.length < 2) return;

    // Draw threshold bands
    const lowY = h - (state.thresholds.low / 100) * h;
    const targetY = h - (state.thresholds.target / 100) * h;

    ctx.fillStyle = 'rgba(212, 69, 59, 0.06)';
    ctx.fillRect(0, lowY, w, h - lowY);

    ctx.fillStyle = 'rgba(62, 131, 50, 0.06)';
    ctx.fillRect(0, targetY, w, lowY - targetY);

    // Threshold lines
    ctx.strokeStyle = 'rgba(212, 69, 59, 0.25)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, lowY);
    ctx.lineTo(w, lowY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(62, 131, 50, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(w, targetY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Data line
    ctx.strokeStyle = '#2c2a27';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * w;
      const y = h - (points[i].value / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(44, 42, 39, 0.05)';
    ctx.fill();

    // Labels
    const labels = document.getElementById('dpTrendLabels');
    const last = points[points.length - 1];
    labels.textContent = last.value + '%';
  }

  /* ----------------------------------------------------------
     TOOLTIP
     ---------------------------------------------------------- */
  const tooltip = document.getElementById('mapTooltip');

  function showTooltip(e, seg, pen) {
    document.getElementById('ttPen').textContent = pen.id;
    document.getElementById('ttSeg').textContent = `Seg ${seg.index + 1}`;
    document.getElementById('ttFill').textContent = seg.fillPct !== null ? seg.fillPct + '%' : '—';
    document.getElementById('ttTime').textContent = formatTimeAgo(pen.lastUpdate);

    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - 10) + 'px';
    tooltip.classList.add('map-tooltip--visible');
  }

  function hideTooltip() {
    tooltip.classList.remove('map-tooltip--visible');
  }

  /* ----------------------------------------------------------
     PAN & ZOOM
     ---------------------------------------------------------- */
  function applyTransform() {
    const inner = document.getElementById('mapInner');
    inner.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  function fitMapToView() {
    const wrap = document.getElementById('mapWrap');
    const wrapRect = wrap.getBoundingClientRect();
    const scaleX = wrapRect.width / IMG_W;
    const scaleY = wrapRect.height / IMG_H;
    state.zoom = Math.min(scaleX, scaleY);
    state.panX = (wrapRect.width - IMG_W * state.zoom) / 2;
    state.panY = (wrapRect.height - IMG_H * state.zoom) / 2;
    applyTransform();
  }

  function initPanZoom() {
    const wrap = document.getElementById('mapWrap');

    // Wheel zoom
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = clamp(state.zoom * delta, 0.15, 5);
      const factor = newZoom / state.zoom;

      state.panX = mx - factor * (mx - state.panX);
      state.panY = my - factor * (my - state.panY);
      state.zoom = newZoom;
      applyTransform();
    }, { passive: false });

    // Mouse pan
    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Don't pan when in drawing mode
      if (state.viewSettings.drawingMode) return;
      // Only pan if not clicking a segment
      if (e.target.classList.contains('bunk-seg')) return;
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
      wrap.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning) return;
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        document.getElementById('mapWrap').style.cursor = 'grab';
      }
    });

    // Touch pan/zoom
    let lastTouches = null;
    wrap.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        if (e.target.classList.contains('bunk-seg')) return;
        // Don't pan when in drawing mode
        if (state.viewSettings.drawingMode) return;
        state.isPanning = true;
        state.panStart = { x: e.touches[0].clientX - state.panX, y: e.touches[0].clientY - state.panY };
      }
      lastTouches = Array.from(e.touches);
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && state.isPanning) {
        state.panX = e.touches[0].clientX - state.panStart.x;
        state.panY = e.touches[0].clientY - state.panStart.y;
        applyTransform();
      } else if (e.touches.length === 2 && lastTouches && lastTouches.length === 2) {
        // Pinch zoom
        const prevDist = Math.hypot(
          lastTouches[0].clientX - lastTouches[1].clientX,
          lastTouches[0].clientY - lastTouches[1].clientY
        );
        const currDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currDist / prevDist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = wrap.getBoundingClientRect();
        const mx = midX - rect.left;
        const my = midY - rect.top;
        const newZoom = clamp(state.zoom * factor, 0.15, 5);
        const f = newZoom / state.zoom;
        state.panX = mx - f * (mx - state.panX);
        state.panY = my - f * (my - state.panY);
        state.zoom = newZoom;
        applyTransform();
      }
      lastTouches = Array.from(e.touches);
    }, { passive: true });

    wrap.addEventListener('touchend', () => {
      state.isPanning = false;
      lastTouches = null;
    });

    // Zoom buttons
    document.getElementById('zoomIn').addEventListener('click', () => {
      const wrap = document.getElementById('mapWrap');
      const rect = wrap.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const newZoom = clamp(state.zoom * 1.3, 0.15, 5);
      const f = newZoom / state.zoom;
      state.panX = cx - f * (cx - state.panX);
      state.panY = cy - f * (cy - state.panY);
      state.zoom = newZoom;
      applyTransform();
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
      const wrap = document.getElementById('mapWrap');
      const rect = wrap.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const newZoom = clamp(state.zoom * 0.7, 0.15, 5);
      const f = newZoom / state.zoom;
      state.panX = cx - f * (cx - state.panX);
      state.panY = cy - f * (cy - state.panY);
      state.zoom = newZoom;
      applyTransform();
    });
  }

  /* ----------------------------------------------------------
     MAP INTERACTION HANDLERS
     ---------------------------------------------------------- */
  function initMapInteraction() {
    const svg = document.getElementById('mapSvg');

    // Segment click -> open detail panel for that pen
    svg.addEventListener('click', (e) => {
      const rect = e.target.closest('.bunk-seg');
      if (!rect) return;
      e.stopPropagation();
      const penId = rect.dataset.pen;
      openDetail(penId);
    });

    // Segment hover -> show tooltip
    svg.addEventListener('mousemove', (e) => {
      const rect = e.target.closest('.bunk-seg');
      if (!rect) { hideTooltip(); return; }
      const penId = rect.dataset.pen;
      const segId = rect.dataset.seg;
      const pen = findPen(penId);
      const seg = pen?.segments.find(s => s.id === segId);
      if (pen && seg) showTooltip(e, seg, pen);
    });

    svg.addEventListener('mouseleave', hideTooltip);
  }

  /* ----------------------------------------------------------
     CONTROL BAR HANDLERS
     ---------------------------------------------------------- */
  function initControls() {
    // View scope buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('ctrl-btn--active'));
        btn.classList.add('ctrl-btn--active');
        state.viewScope = btn.dataset.view;
      });
    });

    // Side filter chips
    document.querySelectorAll('[data-side]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-side]').forEach(c => c.classList.remove('side-chip--active'));
        chip.classList.add('side-chip--active');
        state.sideFilter = chip.dataset.side;
        applySideFilter();
      });
    });

    // Aggregation select
    document.getElementById('ctrlAgg').addEventListener('change', (e) => {
      state.aggregation = e.target.value;
      updateSegmentColors();
    });

    // Time window
    document.getElementById('ctrlWindow').addEventListener('change', (e) => {
      state.timeWindow = e.target.value;
    });

    // Density
    document.getElementById('ctrlDensity').addEventListener('change', (e) => {
      state.density = e.target.value;
      applyDensity();
    });

    // Settings modal
    document.getElementById('ctrlSettings').addEventListener('click', () => {
      document.getElementById('settingsOverlay').classList.add('settings-overlay--open');
      document.getElementById('threshEmpty').value = state.thresholds.empty;
      document.getElementById('threshLow').value = state.thresholds.low;
      document.getElementById('threshTarget').value = state.thresholds.target;
      document.getElementById('threshHigh').value = state.thresholds.high;
      document.getElementById('threshVariance').value = state.thresholds.variance;
    });

    document.getElementById('settingsCancel').addEventListener('click', () => {
      document.getElementById('settingsOverlay').classList.remove('settings-overlay--open');
    });

    document.getElementById('settingsApply').addEventListener('click', () => {
      state.thresholds.empty = parseInt(document.getElementById('threshEmpty').value) || 10;
      state.thresholds.low = parseInt(document.getElementById('threshLow').value) || 30;
      state.thresholds.target = parseInt(document.getElementById('threshTarget').value) || 75;
      state.thresholds.high = parseInt(document.getElementById('threshHigh').value) || 75;
      state.thresholds.variance = parseInt(document.getElementById('threshVariance').value) || 25;
      saveThresholds();
      updateSegmentColors();
      updateSummary();
      if (state.selectedPenId) {
        const pen = findPen(state.selectedPenId);
        if (pen) {
          pen.alerts = generateAlerts(pen.id, pen.segments);
          renderDetail(pen);
        }
      }
      document.getElementById('settingsOverlay').classList.remove('settings-overlay--open');
    });

    // Close settings on overlay click
    document.getElementById('settingsOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('settingsOverlay')) {
        document.getElementById('settingsOverlay').classList.remove('settings-overlay--open');
      }
    });

    // Detail panel close + nav
    document.getElementById('dpClose').addEventListener('click', closeDetail);

    document.getElementById('dpPrev').addEventListener('click', () => {
      navigatePen(-1);
    });

    document.getElementById('dpNext').addEventListener('click', () => {
      navigatePen(1);
    });

    // Notes saving
    document.getElementById('dpNotes').addEventListener('input', (e) => {
      if (state.selectedPenId) {
        state.notes[state.selectedPenId] = e.target.value;
        saveNotes();
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('settingsOverlay').classList.contains('settings-overlay--open')) {
          document.getElementById('settingsOverlay').classList.remove('settings-overlay--open');
        } else {
          closeDetail();
        }
      }
      if (state.selectedPenId) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navigatePen(-1); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigatePen(1); }
      }
    });
  }

  function navigatePen(dir) {
    if (!state.selectedPenId) return;
    const allPens = getAllPens();
    const idx = allPens.findIndex(p => p.id === state.selectedPenId);
    if (idx < 0) return;
    const newIdx = clamp(idx + dir, 0, allPens.length - 1);
    openDetail(allPens[newIdx].id);
  }

  /* ----------------------------------------------------------
     DENSITY MODE
     ---------------------------------------------------------- */
  function applyDensity() {
    const labels = document.querySelectorAll('.pen-label');
    const sideLabels = document.querySelectorAll('.side-label');

    switch (state.density) {
      case 'overview':
        labels.forEach(l => l.style.display = 'none');
        sideLabels.forEach(l => l.style.fontSize = '16px');
        break;
      case 'standard':
        labels.forEach(l => l.style.display = '');
        sideLabels.forEach(l => l.style.fontSize = '13px');
        break;
      case 'detail':
        labels.forEach(l => { l.style.display = ''; l.style.fontSize = '9px'; });
        sideLabels.forEach(l => l.style.fontSize = '11px');
        break;
    }
  }

  /* ----------------------------------------------------------
     API — Live data from Opta gateways via backend server
     Falls back to mock data if server is unavailable.
     ---------------------------------------------------------- */

  const API_BASE = '';  // Same origin — set to 'http://host:port' if separate

  // Bus-to-side mapping for merging Opta bus data into site structure
  const BUS_SIDE_MAP = {
    'BUS-D':  'D',
    'BUS-C1': 'C', 'BUS-C2': 'C',
    'BUS-B1': 'B', 'BUS-B2': 'B',
    'BUS-Z1': 'Z', 'BUS-Z2': 'Z',
  };

  /**
   * Merge a bus data payload from an Opta gateway into the site data model.
   * Called when the backend receives a POST from a gateway and pushes via SSE,
   * or when polling the aggregated endpoint.
   */
  function mergeBusData(busPayload) {
    if (!state.site || !busPayload || !busPayload.nodes) return;
    const sideKey = BUS_SIDE_MAP[busPayload.busId];
    if (!sideKey || !state.site.sides[sideKey]) return;

    const side = state.site.sides[sideKey];

    for (const nodeData of busPayload.nodes) {
      // nodeData.id = "D01-S05" → penId = "D1", segIdx = 4 (0-based)
      const match = nodeData.id.match(/^([A-Z])(\d+)-S(\d+)$/);
      if (!match) continue;

      const penId = match[1] + parseInt(match[2], 10); // "D01" → "D1"
      const segNum = parseInt(match[3], 10);            // 1-based
      const segIdx = segNum - 1;

      const pen = side.pens.find(p => p.id === penId);
      if (!pen || segIdx < 0 || segIdx >= pen.segments.length) continue;

      const seg = pen.segments[segIdx];

      // Update sensor fill values (Modbus values are ×10, UI uses 0–100 float)
      const camFills = [nodeData.cam1Fill, nodeData.cam2Fill, nodeData.cam3Fill, nodeData.cam4Fill];
      for (let s = 0; s < SENSORS_PER_SEG && s < camFills.length; s++) {
        const fillX10 = camFills[s];
        if (fillX10 != null && fillX10 <= 1000) {
          seg.sensors[s].fillPct = fillX10 / 10.0;
          seg.sensors[s].rawMm = Math.round((seg.sensors[s].fillPct / 100) * BUNK_DEPTH_MM);
          seg.sensors[s].health = (nodeData.status & (1 << s)) ? 'ok' : 'fault';
          seg.sensors[s].lastUpdate = Date.now();
        }
      }

      // Recalculate segment aggregates
      const valid = seg.sensors.filter(s => s.fillPct !== null);
      if (valid.length > 0) {
        seg.fillPct = Math.round(
          (valid.reduce((a, s) => a + s.fillPct, 0) / valid.length) * 10
        ) / 10;
        seg.variance = Math.round(
          (Math.max(...valid.map(s => s.fillPct)) -
           Math.min(...valid.map(s => s.fillPct))) * 10
        ) / 10;
      }
      seg.confidence = nodeData.confidence > 75 ? 'high' :
                       nodeData.confidence > 50 ? 'medium' : 'low';
      seg.hasFault = (nodeData.status & 0x0F) !== 0x0F;
    }

    // Recalculate pen-level stats for affected side
    for (const pen of side.pens) {
      const fills = pen.segments.filter(s => s.fillPct !== null).map(s => s.fillPct);
      if (fills.length) {
        pen.avgFill = Math.round(fills.reduce((a, b) => a + b, 0) / fills.length);
        pen.minFill = Math.round(Math.min(...fills));
        pen.maxFill = Math.round(Math.max(...fills));
      }
      pen.lastUpdate = Date.now();
      pen.alerts = generateAlerts(pen.id, pen.segments);
    }

    state.site.timestamp = Date.now();
  }

  /**
   * Fetch aggregated site data from backend.
   * Falls back to mock data if server unavailable.
   */
  function fetchSiteData() {
    if (API_BASE) {
      return fetch(API_BASE + '/api/site')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
          // If server returns bus data array, merge into existing site structure
          if (Array.isArray(data.buses)) {
            if (!state.site) state.site = generateSiteData();
            data.buses.forEach(bus => mergeBusData(bus));
            return state.site;
          }
          return data;
        })
        .catch(() => state.site || generateSiteData());
    }
    return Promise.resolve(state.site || generateSiteData());
  }

  function fetchPenDetail(penId) {
    const pen = findPen(penId);
    return Promise.resolve(pen);
  }

  function fetchAlerts() {
    const all = [];
    if (!state.site) return Promise.resolve(all);
    for (const side of Object.values(state.site.sides)) {
      for (const pen of side.pens) {
        all.push(...pen.alerts.map(a => ({ ...a, pen: pen.id })));
      }
    }
    all.sort((a, b) => b.time - a.time);
    return Promise.resolve(all);
  }

  function fetchSensorHistory(sensorId, timeWindow) {
    return Promise.resolve(generateTrend());
  }

  /* ----------------------------------------------------------
     HELPERS
     ---------------------------------------------------------- */
  function findPen(penId) {
    for (const side of Object.values(state.site.sides)) {
      const pen = side.pens.find(p => p.id === penId);
      if (pen) return pen;
    }
    return null;
  }

  function getAllPens() {
    const pens = [];
    for (const sideKey of ['D', 'C', 'B', 'Z']) {
      if (state.site.sides[sideKey]) {
        pens.push(...state.site.sides[sideKey].pens);
      }
    }
    return pens;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return '<1 min ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ----------------------------------------------------------
     CALIBRATION MODE
     Drag bunk rows (Y) and pen edges (X) to align overlays
     on the aerial image, then export the corrected LAYOUT.
     ---------------------------------------------------------- */
  let calActive = false;
  let calDrag = null; // { type: 'sideY'|'penEdge', side, penIdx, startVal, startMouse }

  function toggleCalibration() {
    calActive = !calActive;
    const panel = document.getElementById('calPanel');
    const btn = document.getElementById('ctrlCalibrate');
    if (calActive) {
      panel.classList.add('cal-panel--open');
      btn.classList.add('ctrl-btn--active');
      buildCalPanel();
      buildCalHandles();
    } else {
      panel.classList.remove('cal-panel--open');
      btn.classList.remove('ctrl-btn--active');
      removeCalHandles();
    }
  }

  function buildCalPanel() {
    const container = document.getElementById('calSides');
    container.innerHTML = '';
    for (const [sideKey, sideLayout] of Object.entries(LAYOUT)) {
      const sec = document.createElement('div');
      sec.className = 'cal-side';
      sec.dataset.side = sideKey;

      const header = document.createElement('div');
      header.className = 'cal-side__header';
      header.innerHTML = `<span>${sideLayout.label}</span><span style="font-size:10px;color:var(--text-muted)">y=${sideLayout.y} h=${sideLayout.bunkH}</span>`;
      header.addEventListener('click', () => sec.classList.toggle('cal-side--expanded'));

      const body = document.createElement('div');
      body.className = 'cal-side__body';

      // Y position row
      body.appendChild(makeCalRow('Y', sideLayout.y, (v) => {
        sideLayout.y = v;
        sideLayout.labelPos.y = v - 10;
        rebuildOverlay();
        buildCalHandles();
      }));

      // bunkH row
      body.appendChild(makeCalRow('Height', sideLayout.bunkH, (v) => {
        sideLayout.bunkH = v;
        rebuildOverlay();
        buildCalHandles();
      }));

      // Pen list
      const pensGrid = document.createElement('div');
      pensGrid.className = 'cal-pens-grid';
      sideLayout.pens.forEach((pen, i) => {
        const row = document.createElement('div');
        row.className = 'cal-pen-row';

        const idSpan = document.createElement('span');
        idSpan.className = 'cal-pen-row__id';
        idSpan.textContent = pen.id;

        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.value = pen.x;
        xInput.title = 'X position';
        xInput.addEventListener('change', () => {
          pen.x = parseInt(xInput.value) || pen.x;
          rebuildOverlay();
          buildCalHandles();
        });

        const wInput = document.createElement('input');
        wInput.type = 'number';
        wInput.value = pen.w;
        wInput.title = 'Width';
        wInput.addEventListener('change', () => {
          pen.w = parseInt(wInput.value) || pen.w;
          rebuildOverlay();
          buildCalHandles();
        });

        const xLabel = document.createElement('span');
        xLabel.textContent = 'x:';
        xLabel.style.cssText = 'font-size:10px;color:var(--text-muted)';
        const wLabel = document.createElement('span');
        wLabel.textContent = 'w:';
        wLabel.style.cssText = 'font-size:10px;color:var(--text-muted)';

        row.append(idSpan, xLabel, xInput, wLabel, wInput);
        pensGrid.appendChild(row);
      });
      body.appendChild(pensGrid);

      sec.append(header, body);
      container.appendChild(sec);
    }
  }

  function makeCalRow(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'cal-row';

    const lbl = document.createElement('span');
    lbl.className = 'cal-row__label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.className = 'cal-row__input';
    input.type = 'number';
    input.value = value;

    const minus = document.createElement('button');
    minus.className = 'cal-row__nudge';
    minus.textContent = '−';
    const plus = document.createElement('button');
    plus.className = 'cal-row__nudge';
    plus.textContent = '+';

    input.addEventListener('change', () => {
      const v = parseInt(input.value);
      if (!isNaN(v)) onChange(v);
    });
    minus.addEventListener('click', () => {
      input.value = parseInt(input.value) - 1;
      onChange(parseInt(input.value));
    });
    plus.addEventListener('click', () => {
      input.value = parseInt(input.value) + 1;
      onChange(parseInt(input.value));
    });

    row.append(lbl, minus, input, plus);
    return row;
  }

  function buildCalHandles() {
    removeCalHandles();
    if (!calActive) return;
    const svg = document.getElementById('mapSvg');

    for (const [sideKey, sl] of Object.entries(LAYOUT)) {
      // Full-width drag handle for side Y
      const handle = document.createElementNS(svgNS, 'rect');
      handle.classList.add('cal-handle');
      const firstPen = sl.pens[0];
      const lastPen = sl.pens[sl.pens.length - 1];
      const xStart = firstPen.x;
      const xEnd = lastPen.x + lastPen.w;
      handle.setAttribute('x', xStart);
      handle.setAttribute('y', sl.y - 4);
      handle.setAttribute('width', xEnd - xStart);
      handle.setAttribute('height', sl.bunkH + 8);
      handle.dataset.calType = 'sideY';
      handle.dataset.calSide = sideKey;
      svg.appendChild(handle);

      // Pen edge handles
      sl.pens.forEach((pen, i) => {
        // Left edge
        const edge = document.createElementNS(svgNS, 'line');
        edge.classList.add('cal-edge');
        edge.setAttribute('x1', pen.x);
        edge.setAttribute('y1', sl.y - 10);
        edge.setAttribute('x2', pen.x);
        edge.setAttribute('y2', sl.y + sl.bunkH + 10);
        edge.dataset.calType = 'penEdge';
        edge.dataset.calSide = sideKey;
        edge.dataset.calPen = i;
        edge.dataset.calEdge = 'left';
        svg.appendChild(edge);
      });
      // Right edge of last pen
      const rEdge = document.createElementNS(svgNS, 'line');
      rEdge.classList.add('cal-edge');
      const lp = sl.pens[sl.pens.length - 1];
      rEdge.setAttribute('x1', lp.x + lp.w);
      rEdge.setAttribute('y1', sl.y - 10);
      rEdge.setAttribute('x2', lp.x + lp.w);
      rEdge.setAttribute('y2', sl.y + sl.bunkH + 10);
      rEdge.dataset.calType = 'penEdgeRight';
      rEdge.dataset.calSide = sideKey;
      rEdge.dataset.calPen = sl.pens.length - 1;
      svg.appendChild(rEdge);
    }
  }

  function removeCalHandles() {
    document.querySelectorAll('.cal-handle, .cal-edge').forEach(el => el.remove());
  }

  function initCalDrag() {
    const svg = document.getElementById('mapSvg');

    svg.addEventListener('mousedown', (e) => {
      if (!calActive) return;
      const el = e.target;
      const calType = el.dataset.calType;
      if (!calType) return;
      e.preventDefault();
      e.stopPropagation();

      const sideKey = el.dataset.calSide;
      const sl = LAYOUT[sideKey];
      const svgPt = toSvgCoords(e);

      if (calType === 'sideY') {
        calDrag = { type: 'sideY', side: sideKey, startY: sl.y, startMouse: svgPt.y };
      } else if (calType === 'penEdge') {
        const pi = parseInt(el.dataset.calPen);
        calDrag = { type: 'penEdge', side: sideKey, penIdx: pi, startX: sl.pens[pi].x, startMouse: svgPt.x };
      } else if (calType === 'penEdgeRight') {
        const pi = parseInt(el.dataset.calPen);
        calDrag = { type: 'penEdgeRight', side: sideKey, penIdx: pi, startW: sl.pens[pi].w, startMouse: svgPt.x };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!calDrag) return;
      const svgPt = toSvgCoords(e);
      const sl = LAYOUT[calDrag.side];

      if (calDrag.type === 'sideY') {
        const dy = Math.round(svgPt.y - calDrag.startMouse);
        sl.y = calDrag.startY + dy;
        sl.labelPos.y = sl.y - 10;
      } else if (calDrag.type === 'penEdge') {
        const dx = Math.round(svgPt.x - calDrag.startMouse);
        const pen = sl.pens[calDrag.penIdx];
        const newX = calDrag.startX + dx;
        // Adjust width to keep right edge fixed
        pen.w = pen.w + (pen.x - newX);
        pen.x = newX;
        // Also adjust previous pen's width if exists
        if (calDrag.penIdx > 0) {
          const prev = sl.pens[calDrag.penIdx - 1];
          prev.w = newX - prev.x;
        }
      } else if (calDrag.type === 'penEdgeRight') {
        const dx = Math.round(svgPt.x - calDrag.startMouse);
        sl.pens[calDrag.penIdx].w = calDrag.startW + dx;
      }

      rebuildOverlay();
      buildCalHandles();
      buildCalPanel();
    });

    window.addEventListener('mouseup', () => {
      calDrag = null;
    });
  }

  function toSvgCoords(e) {
    const svg = document.getElementById('mapSvg');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM().inverse();
    return pt.matrixTransform(ctm);
  }

  function rebuildOverlay() {
    buildSvgOverlay();
    updateSegmentColors();
    applySideFilter();
    applyDensity();
  }

  function exportLayoutCode() {
    let code = 'const LAYOUT = {\n';
    for (const [sideKey, sl] of Object.entries(LAYOUT)) {
      code += `    ${sideKey}: {\n`;
      code += `      label: '${sl.label}',\n`;
      code += `      totalLength: ${sl.totalLength},\n`;
      code += `      y: ${sl.y},\n`;
      code += `      bunkH: ${sl.bunkH},\n`;
      code += `      labelPos: { x: ${sl.labelPos.x}, y: ${sl.labelPos.y} },\n`;
      code += `      pens: [\n`;
      for (const p of sl.pens) {
        const id = `'${p.id}'`;
        code += `        { id: ${id.padEnd(5)}, x: ${String(p.x).padStart(4)},  w: ${String(p.w).padStart(3)} },\n`;
      }
      code += `      ]\n    },\n`;
    }
    code += '  };';
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('calExport');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Layout Code'; }, 2000);
    });
  }

  function initCalibration() {
    document.getElementById('ctrlCalibrate').addEventListener('click', toggleCalibration);
    document.getElementById('calClose').addEventListener('click', toggleCalibration);
    document.getElementById('calExport').addEventListener('click', exportLayoutCode);
    document.getElementById('calReset').addEventListener('click', () => {
      location.reload();
    });
    initCalDrag();
  }

  function initViewControls() {
    // Toggle pen outlines
    document.getElementById('toggleOutlines').addEventListener('click', () => {
      state.viewSettings.penOutlines = !state.viewSettings.penOutlines;
      updateViewControlButtons();
      rebuildOverlay();
    });

    // Toggle reference outlines
    document.getElementById('toggleReferences').addEventListener('click', () => {
      state.viewSettings.showReferences = !state.viewSettings.showReferences;
      updateViewControlButtons();
      renderCustomDrawings();
    });

    // Toggle drawing mode
    document.getElementById('drawMode').addEventListener('click', () => {
      state.viewSettings.drawingMode = !state.viewSettings.drawingMode;
      updateViewControlButtons();
      toggleDrawingMode();
    });

    // Clear all drawings
    document.getElementById('clearDrawings').addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all custom drawings?')) {
        state.customDrawings = [];
        renderCustomDrawings();
      }
    });

    // Toggle background image
    document.getElementById('toggleBackground').addEventListener('click', () => {
      state.viewSettings.showBackground = !state.viewSettings.showBackground;
      updateViewControlButtons();
      applyBackgroundSetting();
    });

    // Save changes
    document.getElementById('saveChanges').addEventListener('click', () => {
      saveViewSettings();
      saveCustomDrawings();
      showSaveIndicator();
    });

    // Initialize button states
    updateViewControlButtons();
    applyBackgroundSetting();
    initDrawingEvents();
    
    // Load and render any existing drawings
    console.log('Loading', state.customDrawings.length, 'saved drawings');
    if (state.customDrawings.length > 0 || state.referenceOutlines.length > 0) {
      renderCustomDrawings();
    }
  }

  function updateViewControlButtons() {
    const outlineBtn = document.getElementById('toggleOutlines');
    const referenceBtn = document.getElementById('toggleReferences');
    const drawBtn = document.getElementById('drawMode');
    const backgroundBtn = document.getElementById('toggleBackground');
    
    if (state.viewSettings.penOutlines) {
      outlineBtn.classList.add('map-control__btn--active');
    } else {
      outlineBtn.classList.remove('map-control__btn--active');
    }
    
    if (state.viewSettings.showReferences) {
      referenceBtn.classList.add('map-control__btn--active');
    } else {
      referenceBtn.classList.remove('map-control__btn--active');
    }
    
    if (state.viewSettings.drawingMode) {
      drawBtn.classList.add('map-control__btn--drawing');
    } else {
      drawBtn.classList.remove('map-control__btn--drawing');
    }
    
    if (state.viewSettings.showBackground) {
      backgroundBtn.classList.add('map-control__btn--active');
    } else {
      backgroundBtn.classList.remove('map-control__btn--active');
    }
  }

  function applyBackgroundSetting() {
    const img = document.getElementById('mapBg');
    if (state.viewSettings.showBackground) {
      img.classList.remove('map-bg--hidden');
    } else {
      img.classList.add('map-bg--hidden');
    }
  }

  function showSaveIndicator() {
    const saveBtn = document.getElementById('saveChanges');
    saveBtn.classList.add('map-control__btn--saved');
    
    // Remove saved indicator after 2 seconds
    setTimeout(() => {
      saveBtn.classList.remove('map-control__btn--saved');
    }, 2000);
  }

  function toggleDrawingMode() {
    const mapWrap = document.getElementById('mapWrap');
    
    if (state.viewSettings.drawingMode) {
      mapWrap.classList.add('drawing-cursor');
      // Disable panning when drawing
      state.drawingModeActive = true;
      console.log('Drawing mode activated');
    } else {
      mapWrap.classList.remove('drawing-cursor');
      state.drawingModeActive = false;
      console.log('Drawing mode deactivated');
      // Cancel any current drawing
      if (state.currentDrawing) {
        cancelCurrentDrawing();
      }
    }
  }

  function initDrawingEvents() {
    const svg = document.getElementById('mapSvg');
    
    // Use single event handlers that check drawing mode
    svg.addEventListener('mousedown', handleDrawingMouseDown, true);
    svg.addEventListener('mousemove', handleDrawingMouseMove, true);
    svg.addEventListener('mouseup', handleDrawingMouseUp, true);
    
    // Touch events for mobile
    svg.addEventListener('touchstart', handleDrawingTouchStart, true);
    svg.addEventListener('touchmove', handleDrawingTouchMove, true);
    svg.addEventListener('touchend', handleDrawingTouchEnd, true);
  }

  function handleDrawingMouseDown(e) {
    if (!state.viewSettings.drawingMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const point = getDrawingPoint(e);
    state.isDrawing = true;
    state.currentDrawing = {
      id: Date.now().toString(),
      points: [point],
      element: null
    };
    
    createDrawingPreview();
  }

  function handleDrawingMouseMove(e) {
    if (!state.viewSettings.drawingMode || !state.isDrawing || !state.currentDrawing) return;
    
    e.preventDefault();
    const point = getDrawingPoint(e);
    state.currentDrawing.points.push(point);
    updateDrawingPreview();
  }

  function handleDrawingMouseUp(e) {
    if (!state.viewSettings.drawingMode || !state.isDrawing || !state.currentDrawing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    finishDrawing();
    state.isDrawing = false;
  }

  function handleDrawingTouchStart(e) {
    if (!state.viewSettings.drawingMode) return;
    handleDrawingMouseDown(e);
  }

  function handleDrawingTouchMove(e) {
    if (!state.viewSettings.drawingMode) return;
    handleDrawingMouseMove(e);
  }

  function handleDrawingTouchEnd(e) {
    if (!state.viewSettings.drawingMode) return;
    handleDrawingMouseUp(e);
  }

  function getDrawingPoint(e) {
    const svg = document.getElementById('mapSvg');
    const pt = svg.createSVGPoint();
    
    if (e.touches && e.touches.length > 0) {
      pt.x = e.touches[0].clientX;
      pt.y = e.touches[0].clientY;
    } else {
      pt.x = e.clientX;
      pt.y = e.clientY;
    }
    
    const ctm = svg.getScreenCTM().inverse();
    return pt.matrixTransform(ctm);
  }

  function createDrawingPreview() {
    const svg = document.getElementById('mapSvg');
    
    // Remove any existing preview
    const existingPreview = document.getElementById('drawing-preview');
    if (existingPreview) existingPreview.remove();
    
    const path = document.createElementNS(svgNS, 'path');
    path.classList.add('drawing-preview');
    path.setAttribute('id', 'drawing-preview');
    path.style.fill = 'none';
    path.style.stroke = 'var(--alert-warning)';
    path.style.strokeWidth = '2';
    path.style.strokeDasharray = '4,2';
    path.style.opacity = '0.6';
    path.style.pointerEvents = 'none';
    svg.appendChild(path);
    state.currentDrawing.element = path;
    
    console.log('Created drawing preview');
  }

  function updateDrawingPreview() {
    if (!state.currentDrawing || !state.currentDrawing.element) return;
    
    const pathData = pointsToPath(state.currentDrawing.points);
    state.currentDrawing.element.setAttribute('d', pathData);
  }

  function finishDrawing() {
    if (!state.currentDrawing || state.currentDrawing.points.length < 2) {
      cancelCurrentDrawing();
      return;
    }
    
    // Remove preview
    const preview = document.getElementById('drawing-preview');
    if (preview) preview.remove();
    
    // Add to saved drawings
    state.customDrawings.push({
      id: state.currentDrawing.id,
      points: [...state.currentDrawing.points], // Create a copy
      timestamp: Date.now()
    });
    
    // Render the final drawing
    renderCustomDrawings();
    
    state.currentDrawing = null;
    
    console.log('Drawing finished, total drawings:', state.customDrawings.length);
  }

  function cancelCurrentDrawing() {
    const preview = document.getElementById('drawing-preview');
    if (preview) preview.remove();
    state.currentDrawing = null;
  }

  function pointsToPath(points) {
    if (!points || points.length === 0) {
      console.log('No points provided for path');
      return '';
    }
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    console.log('Generated path:', path, 'from', points.length, 'points');
    return path;
  }

  function renderCustomDrawings() {
    const svg = document.getElementById('mapSvg');
    
    // Remove existing drawings and references
    const existingDrawings = svg.querySelectorAll('.custom-drawing, .reference-outline, .reference-label');
    existingDrawings.forEach(d => d.remove());
    
    console.log('Rendering', state.customDrawings.length, 'custom drawings and', state.referenceOutlines.length, 'reference outlines');
    
    // Add reference outlines first (lower z-index) if enabled
    if (state.viewSettings.showReferences) {
      // Group references by type and render in order: roads, facilities, water, pens
      const groupedOutlines = {
        road: [],
        facility: [],
        water: [],
        pen: []
      };
      
      state.referenceOutlines.forEach(outline => {
        if (groupedOutlines[outline.type]) {
          groupedOutlines[outline.type].push(outline);
        }
      });
      
      // Render in order: roads first (bottom layer), then facilities, water, pens on top
      [...groupedOutlines.road, ...groupedOutlines.facility, ...groupedOutlines.water, ...groupedOutlines.pen].forEach((outline, index) => {
        const path = document.createElementNS(svgNS, 'path');
        path.classList.add('reference-outline');
        path.classList.add(`reference-${outline.type}`);
        const pathData = pointsToPath(outline.points);
        path.setAttribute('d', pathData);
        path.setAttribute('data-outline-id', outline.id);
        path.setAttribute('data-outline-type', outline.type);
        
        // Style reference outlines based on type
        path.style.fill = outline.type === 'road' ? 'rgba(127, 140, 141, 0.3)' : 'none';
        path.style.stroke = outline.color || '#666';
        
        switch (outline.type) {
          case 'road':
            path.style.strokeWidth = '2';
            path.style.strokeDasharray = 'none';
            path.style.opacity = '0.6';
            break;
          case 'facility':
            path.style.strokeWidth = '3';
            path.style.strokeDasharray = '8,4';
            path.style.opacity = '0.7';
            break;
          case 'water':
            path.style.strokeWidth = '3';
            path.style.strokeDasharray = '6,2';
            path.style.opacity = '0.7';
            break;
          case 'pen':
            path.style.strokeWidth = '2';
            path.style.strokeDasharray = '4,2';
            path.style.opacity = '0.5';
            break;
          default:
            path.style.strokeWidth = '2';
            path.style.strokeDasharray = '6,3';
            path.style.opacity = '0.4';
        }
        
        path.style.pointerEvents = 'none';
        svg.appendChild(path);
        
        // Add labels for reference outlines (exclude individual pen labels to avoid clutter)
        if (outline.label && outline.type !== 'pen') {
          const text = document.createElementNS(svgNS, 'text');
          text.classList.add('reference-label');
          text.classList.add(`reference-label-${outline.type}`);
          const centerX = outline.points.reduce((sum, p) => sum + p.x, 0) / outline.points.length;
          const centerY = outline.points.reduce((sum, p) => sum + p.y, 0) / outline.points.length;
          text.setAttribute('x', centerX);
          text.setAttribute('y', centerY);
          text.style.fill = outline.color || '#666';
          text.style.fontSize = outline.type === 'road' ? '12px' : '13px';
          text.style.fontWeight = 'bold';
          text.style.textAnchor = 'middle';
          text.style.pointerEvents = 'none';
          text.style.opacity = '0.8';
          text.style.textShadow = '1px 1px 2px rgba(255,255,255,0.8)';
          text.textContent = outline.label;
          svg.appendChild(text);
        }
      });
    }
    
    // Add custom drawings on top
    state.customDrawings.forEach((drawing, index) => {
      const path = document.createElementNS(svgNS, 'path');
      path.classList.add('custom-drawing');
      const pathData = pointsToPath(drawing.points);
      path.setAttribute('d', pathData);
      path.setAttribute('data-drawing-id', drawing.id);
      
      // Use different colors for each drawing
      const hue = (index * 60) % 360;
      path.style.stroke = `hsl(${hue}, 70%, 50%)`;
      path.style.fill = 'none';
      path.style.strokeWidth = '3';
      path.style.strokeDasharray = '8,4';
      path.style.opacity = '0.8';
      
      svg.appendChild(path);
      console.log('Added drawing path:', pathData);
    });
  }

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  function init() {
    // Generate initial data
    state.site = generateSiteData();

    // Wait for layout image to load, then build overlay
    const img = document.getElementById('mapBg');
    const onLoad = () => {
      buildSvgOverlay();
      updateSummary();
      fitMapToView();
      applySideFilter();
      applyDensity();
    };

    if (img.complete) {
      onLoad();
    } else {
      img.addEventListener('load', onLoad);
    }

    initPanZoom();
    initMapInteraction();
    initControls();
    initViewControls();
    initCalibration();

    // Start polling loop
    setInterval(() => {
      updateSiteData();
      updateSegmentColors();
      updateSummary();
      if (state.selectedPenId) {
        const pen = findPen(state.selectedPenId);
        if (pen) renderDetail(pen);
      }
    }, POLL_INTERVAL_MS);

    // Handle window resize
    window.addEventListener('resize', () => {
      fitMapToView();
    });

    // Auto-open detail for testing via ?pen=B5
    const params = new URLSearchParams(window.location.search);
    const autoPen = params.get('pen');
    if (autoPen && findPen(autoPen)) {
      setTimeout(() => openDetail(autoPen), 500);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
