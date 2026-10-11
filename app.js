import L from 'leaflet';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update } from 'firebase/database';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

// ============================================================================
// State & Configuration
// ============================================================================
let isDemoMode = false;
let db = null;
let vitalsChart = null;
let leafletMap = null;
let mapMarker = null;
let mapCircle = null;

const alertsMap = new Map();
let activeUnackedAlert = null;

// Demo Simulation Data
const demoData = {
  heartRates: [72, 74, 76, 78, 80, 75, 73, 77],
  spo2Values: [97, 98, 98, 99, 97, 98, 96, 98],
  movements: [
    { label: 'Normal', g: 1.01 },
    { label: 'Steady', g: 0.99 },
    { label: 'Low', g: 0.98 },
    { label: 'Walking', g: 1.12 }
  ],
  batteries: [86, 85, 85, 84, 83],
  locations: [
    { lat: 12.9716, lng: 77.5946, acc: 3.5, source: 'gps' },
    { lat: 12.9720, lng: 77.5950, acc: 25.0, source: 'wifi' },
    { lat: 12.9750, lng: 77.6000, acc: 1500.0, source: 'ip' }
  ]
};

// ============================================================================
// Toast Notification
// ============================================================================
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ============================================================================
// Leaflet Map Initialization
// ============================================================================
function initMap(lat = 12.9716, lng = 77.5946, accuracy = 3.5, source = 'gps') {
  const mapElem = document.getElementById('map');
  if (!mapElem) return;

  if (!leafletMap) {
    leafletMap = L.map('map', {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false
    });

    // Dark-mode themed CartoDB / OSM tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(leafletMap);

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="background:#0284c7;color:#fff;width:28px;height:28px;border-radius:50%;border:2px solid #fff;display:grid;place-items:center;font-size:14px;box-shadow:0 0 10px rgba(2,132,199,0.7)">⌖</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    mapMarker = L.marker([lat, lng], { icon: customIcon }).addTo(leafletMap);
    mapCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.18,
      weight: 1.5
    }).addTo(leafletMap);
  }

  updateMapLocation(lat, lng, accuracy, source);
}

function updateMapLocation(lat, lng, accuracy = 10, source = 'gps') {
  if (!leafletMap) return;

  if (mapMarker) mapMarker.setLatLng([lat, lng]);
  if (mapCircle) {
    mapCircle.setLatLng([lat, lng]);
    mapCircle.setRadius(accuracy || 15);
  }
  leafletMap.panTo([lat, lng]);

  // Update UI Elements
  const elLat = document.getElementById('map-lat');
  const elLng = document.getElementById('map-lng');
  const elAcc = document.getElementById('map-acc');
  const elSrc = document.getElementById('map-source-text');
  const elBadge = document.getElementById('map-source-badge');

  if (elLat) elLat.textContent = Number(lat).toFixed(4);
  if (elLng) elLng.textContent = Number(lng).toFixed(4);
  if (elAcc) elAcc.textContent = `± ${(accuracy || 5).toFixed(1)} m`;

  const srcUpper = (source || 'gps').toUpperCase();
  if (elSrc) elSrc.textContent = `${srcUpper} FIX`;

  if (elBadge) {
    if (srcUpper === 'GPS') {
      elBadge.style.color = 'var(--accent-cyan)';
      elBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    } else if (srcUpper === 'WIFI') {
      elBadge.style.color = 'var(--accent-blue)';
      elBadge.style.borderColor = 'rgba(96, 165, 250, 0.4)';
    } else {
      elBadge.style.color = 'var(--accent-amber)';
      elBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    }
  }
}

// ============================================================================
// Chart.js Telemetry Trend
// ============================================================================
function initChart() {
  const ctx = document.getElementById('vitalsChart')?.getContext('2d');
  if (!ctx) return;

  const initialLabels = ['00:00', '00:05', '00:10', '00:15', '00:20', '00:25', '00:30', 'Now'];
  const initialHR = [74, 76, 75, 78, 80, 77, 75, 76];
  const initialSpO2 = [98, 98, 97, 98, 99, 98, 97, 98];

  vitalsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: initialLabels,
      datasets: [
        {
          label: 'Heart Rate (BPM)',
          data: initialHR,
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'yHR'
        },
        {
          label: 'SpO2 (%)',
          data: initialSpO2,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.05)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'ySpO2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11, weight: 600 },
            boxWidth: 12
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        yHR: {
          type: 'linear',
          position: 'left',
          min: 50,
          max: 130,
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#f43f5e', font: { size: 10 } }
        },
        ySpO2: {
          type: 'linear',
          position: 'right',
          min: 80,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: '#38bdf8', font: { size: 10 } }
        }
      }
    }
  });
}

function appendChartData(hr, spo2) {
  if (!vitalsChart) return;
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  vitalsChart.data.labels.push(nowStr);
  vitalsChart.data.datasets[0].data.push(hr);
  vitalsChart.data.datasets[1].data.push(spo2);

  if (vitalsChart.data.labels.length > 15) {
    vitalsChart.data.labels.shift();
    vitalsChart.data.datasets[0].data.shift();
    vitalsChart.data.datasets[1].data.shift();
  }
  vitalsChart.update('none');
}

// ============================================================================
// UI Updates: Vitals & Battery
// ============================================================================
function updateVitalsUI(data) {
  const elHR = document.getElementById('val-heart-rate');
  const elSpO2 = document.getElementById('val-spo2');
  const elMov = document.getElementById('val-movement');
  const elBat = document.getElementById('val-battery');
  const elBatBar = document.getElementById('val-battery-bar');
  const elFinger = document.getElementById('finger-status-text');
  const elLastSeen = document.getElementById('last-seen-time');

  if (data.heartRate !== null && data.heartRate !== undefined) {
    if (elHR) elHR.textContent = Math.round(data.heartRate);
    if (elFinger) elFinger.textContent = 'Active pulse detected';
  } else {
    if (elHR) elHR.textContent = '--';
    if (elFinger) elFinger.textContent = 'No finger detected';
  }

  if (data.spo2 !== null && data.spo2 !== undefined) {
    if (elSpO2) elSpO2.textContent = Math.round(data.spo2);
  } else {
    if (elSpO2) elSpO2.textContent = '--';
  }

  if (data.movement) {
    if (elMov) elMov.textContent = data.movement;
  }

  if (data.battery !== undefined) {
    if (elBat) elBat.textContent = data.battery;
    if (elBatBar) elBatBar.style.width = `${data.battery}%`;
  }

  if (elLastSeen) {
    const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elLastSeen.textContent = `Updated: ${timeStr}`;
  }

  if (data.heartRate && data.spo2) {
    appendChartData(Number(data.heartRate), Number(data.spo2));
  }
}

// ============================================================================
// Alerts Feed & Acknowledgment
// ============================================================================
async function acknowledgeAlert(alertId) {
  if (!alertId) return;

  // 1. Try Firebase RTDB direct update
  if (db && !isDemoMode) {
    try {
      await update(ref(db, `alerts/${alertId}`), {
        acknowledged: true,
        acknowledgedAt: Date.now()
      });
    } catch (err) {
      console.warn('[Firebase] Direct acknowledge failed, trying API:', err);
    }
  }

  // 2. Also call /api/acknowledge endpoint
  try {
    await fetch('/api/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, deviceId: 'safeband-01' })
    });
  } catch (err) {
    console.warn('[API] Acknowledge error:', err);
  }

  // 3. Local state update
  if (alertsMap.has(alertId)) {
    const item = alertsMap.get(alertId);
    item.acknowledged = true;
    alertsMap.set(alertId, item);
  }

  showToast('✓ Alert successfully acknowledged');
  renderAlertsList();
  checkCriticalBanner();
}

function checkCriticalBanner() {
  const banner = document.getElementById('active-alert-banner');
  const bannerTitle = document.getElementById('banner-alert-title');
  const bannerDesc = document.getElementById('banner-alert-desc');
  const bannerBtn = document.getElementById('banner-btn-ack');

  // Find most recent unacknowledged critical alert
  let latestUnack = null;
  for (const alert of alertsMap.values()) {
    if (!alert.acknowledged) {
      latestUnack = alert;
      break;
    }
  }

  activeUnackedAlert = latestUnack;

  if (latestUnack && banner) {
    banner.style.display = 'flex';
    if (bannerTitle) bannerTitle.textContent = `CRITICAL ALERT: ${latestUnack.type} DETECTED!`;
    if (bannerDesc) bannerDesc.textContent = latestUnack.summary || 'Immediate caregiver attention is required. Please verify wearer status.';
    if (bannerBtn) {
      bannerBtn.onclick = () => acknowledgeAlert(latestUnack.id || latestUnack.key);
    }
  } else if (banner) {
    banner.style.display = 'none';
  }
}

function renderAlertsList() {
  const container = document.getElementById('alerts-container');
  const countBadge = document.getElementById('alerts-count-badge');
  const navCount = document.getElementById('nav-alert-count');
  if (!container) return;

  const alerts = Array.from(alertsMap.values()).reverse();
  const unackCount = alerts.filter(a => !a.acknowledged).length;

  if (countBadge) countBadge.textContent = `${alerts.length} Total (${unackCount} New)`;
  if (navCount) navCount.textContent = unackCount;

  if (alerts.length === 0) {
    container.innerHTML = `<div class="empty-state">No alerts recorded yet. System monitoring active.</div>`;
    return;
  }

  container.innerHTML = alerts.map(alert => {
    const id = alert.id || alert.key || `alert-${alert.timestamp}`;
    const isCritical = !alert.acknowledged;
    const timeFormatted = new Date(alert.timestamp || alert.receivedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const locLabel = (alert.locSource || 'none').toUpperCase();

    return `
      <div class="alert-row ${isCritical ? 'critical' : 'acknowledged'}" id="row-${id}">
        <span class="alert-type-pill ${alert.type}">${alert.type}</span>
        <div class="alert-details">
          <strong>${alert.type} Event on ${alert.deviceId || 'safeband-01'}</strong>
          <p>${alert.summary || 'Telemetry threshold exceeded. Incident dispatched.'}</p>
          <small>
            <span>🕒 ${timeFormatted}</span>
            <span style="margin-left:10px">📡 Location: ${locLabel}</span>
            ${alert.heartRate ? `<span style="margin-left:10px">💓 HR: ${alert.heartRate} BPM</span>` : ''}
          </small>
        </div>
        ${!alert.acknowledged
          ? `<button class="btn btn-danger btn-ack" data-id="${id}" type="button">Acknowledge</button>`
          : `<span style="color:var(--accent-emerald);font-size:11px;font-weight:700">✓ Acknowledged</span>`
        }
      </div>
    `;
  }).join('');

  // Attach event listeners to Acknowledge buttons
  container.querySelectorAll('.btn-ack').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const alertId = e.currentTarget.getAttribute('data-id');
      acknowledgeAlert(alertId);
    });
  });
}

// ============================================================================
// Firebase Realtime Database Listener
// ============================================================================
function setupFirebase() {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  const hasConfig = Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey && firebaseConfig.projectId);

  if (!hasConfig) {
    console.log('[Dashboard] Firebase config not set or incomplete. Entering Demo Mode.');
    enableDemoMode();
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);

    // Update status indicators
    const statusDot = document.getElementById('system-status-dot');
    const statusTitle = document.getElementById('system-status-title');
    const statusDesc = document.getElementById('system-status-desc');
    const modeBadge = document.getElementById('data-mode-badge');

    if (statusDot) statusDot.classList.add('online');
    if (statusTitle) statusTitle.textContent = 'Firebase Connected';
    if (statusDesc) statusDesc.textContent = 'Listening to real-time events';
    if (modeBadge) {
      modeBadge.classList.add('live');
      modeBadge.innerHTML = `<span class="pulse-dot online" style="width:6px;height:6px"></span> LIVE TELEMETRY`;
    }

    // 1. Listen to Latest Device State
    const latestRef = ref(db, 'devices/safeband-01/latest');
    onValue(latestRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.vitals) {
          updateVitalsUI(data.vitals);
          if (data.vitals.lat && data.vitals.lng) {
            updateMapLocation(data.vitals.lat, data.vitals.lng, data.vitals.accuracy, data.vitals.locSource);
          }
        }
      } else {
        // Empty DB -> Fallback to demo values
        simulateDemoReading();
      }
    }, (error) => {
      console.warn('[Firebase] Database read error, switching to demo mode:', error);
      enableDemoMode();
    });

    // 2. Listen to Alerts
    const alertsRef = ref(db, 'alerts');
    onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        alertsMap.clear();
        Object.keys(data).forEach(key => {
          alertsMap.set(key, { ...data[key], id: key });
        });
        renderAlertsList();
        checkCriticalBanner();
      }
    });

  } catch (err) {
    console.warn('[Dashboard] Firebase initialization failed:', err);
    enableDemoMode();
  }
}

// ============================================================================
// Demo Mode & Simulations
// ============================================================================
function enableDemoMode() {
  isDemoMode = true;
  const statusDot = document.getElementById('system-status-dot');
  const statusTitle = document.getElementById('system-status-title');
  const statusDesc = document.getElementById('system-status-desc');
  const modeBadge = document.getElementById('data-mode-badge');

  if (statusDot) statusDot.classList.remove('online');
  if (statusTitle) statusTitle.textContent = 'Demo Mode';
  if (statusDesc) statusDesc.textContent = 'Simulated Hardware Telemetry';
  if (modeBadge) {
    modeBadge.classList.remove('live');
    modeBadge.innerHTML = `<span class="pulse-dot" style="width:6px;height:6px"></span> DEMO MODE`;
  }

  // Pre-populate with initial demo alert
  if (alertsMap.size === 0) {
    alertsMap.set('demo-alert-01', {
      id: 'demo-alert-01',
      deviceId: 'safeband-01',
      type: 'FALL',
      heartRate: 82,
      spo2: 97,
      lat: 12.9716,
      lng: 77.5946,
      locSource: 'gps',
      accuracy: 3.5,
      timestamp: Date.now() - 120000,
      summary: 'Impact acceleration (3.2g) followed by stillness. Wearer button countdown timed out.',
      acknowledged: false
    });
    renderAlertsList();
    checkCriticalBanner();
  }

  simulateDemoReading();
}

function simulateDemoReading() {
  const hr = demoData.heartRates[Math.floor(Math.random() * demoData.heartRates.length)];
  const spo2 = demoData.spo2Values[Math.floor(Math.random() * demoData.spo2Values.length)];
  const mov = demoData.movements[Math.floor(Math.random() * demoData.movements.length)];
  const bat = demoData.batteries[Math.floor(Math.random() * demoData.batteries.length)];
  const loc = demoData.locations[Math.floor(Math.random() * demoData.locations.length)];

  updateVitalsUI({
    heartRate: hr,
    spo2: spo2,
    movement: `${mov.label} (${mov.g}g)`,
    battery: bat,
    timestamp: Date.now()
  });

  updateMapLocation(loc.lat, loc.lng, loc.acc, loc.source);
}

function triggerSimulatedAlert() {
  const alertTypes = ['FALL', 'LOW_SPO2', 'SOS'];
  const chosenType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
  const simId = `sim-${Date.now()}`;

  const newAlert = {
    id: simId,
    deviceId: 'safeband-01',
    type: chosenType,
    heartRate: chosenType === 'SOS' ? 112 : (chosenType === 'LOW_SPO2' ? 74 : 88),
    spo2: chosenType === 'LOW_SPO2' ? 86 : 98,
    lat: 12.9716,
    lng: 77.5946,
    locSource: 'gps',
    accuracy: 3.5,
    timestamp: Date.now(),
    summary: chosenType === 'FALL'
      ? 'Sudden 3.1g acceleration detected. Countdown expired without cancellation.'
      : (chosenType === 'LOW_SPO2'
        ? 'SpO2 level maintained at 86% (<90%) for 10 seconds with finger attached.'
        : 'Emergency SOS button held for 3 seconds. Caregiver alert transmitted.'),
    acknowledged: false
  };

  alertsMap.set(simId, newAlert);
  renderAlertsList();
  checkCriticalBanner();
  showToast(`🚨 New ${chosenType} alert triggered!`);
}

// ============================================================================
// Initialization on DOM Load
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initMap(12.9716, 77.5946, 3.5, 'gps');
  initChart();
  setupFirebase();

  // Button Listeners
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    simulateDemoReading();
    showToast('↻ Dashboard telemetry refreshed');
  });

  document.getElementById('btn-sim-alert')?.addEventListener('click', () => {
    triggerSimulatedAlert();
  });

  document.getElementById('btn-toggle-demo')?.addEventListener('click', () => {
    if (isDemoMode) {
      setupFirebase();
      showToast('Connecting to Firebase...');
    } else {
      enableDemoMode();
      showToast('Switched to Demo Mode');
    }
  });

  // Periodic Telemetry Simulation when in Demo Mode
  setInterval(() => {
    if (isDemoMode) {
      simulateDemoReading();
    }
  }, 5000);
});
