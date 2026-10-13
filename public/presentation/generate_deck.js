const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

async function buildPitchDeck() {
    console.log("Generating perfectly aligned SafeBand Widescreen Pitch Deck...");
    const pptx = new pptxgen();

    // Standard 16:9 Modern Widescreen Dimensions (13.333" x 7.5")
    pptx.defineLayout({ name: 'WIDE_16_9', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE_16_9';
    
    pptx.author = 'SafeBand Engineering Team';
    pptx.company = 'SafeBand MedTech Systems';
    pptx.title = 'SafeBand: Autonomous AI Fall Detection & Vitals Wearable';

    // Theme Palette
    const NAVY = '0A1128';
    const CARD_BG = '132247';
    const ACCENT_CYAN = '00D2FF';
    const ACCENT_RED = 'FF3366';
    const ACCENT_GREEN = '00F5D4';
    const TEXT_WHITE = 'FFFFFF';
    const TEXT_MUTED = '94A3B8';
    const BORDER_COLOR = '1E3A8A';

    const imgDir = __dirname;
    const imgProduct = path.join(imgDir, 'safeband_product_render.jpg');
    const imgUI = path.join(imgDir, 'safeband_ui_screens.jpg');
    const imgExploded = path.join(imgDir, 'safeband_exploded_hardware.jpg');
    const imgS3Board = path.join(imgDir, 'esp32_s3_round_lcd.jpg');

    // Consistent Header Function
    function addHeader(slide, category, title) {
        slide.background = { color: NAVY };

        slide.addText(category.toUpperCase(), {
            x: 0.8, y: 0.45, w: 11.7, h: 0.3,
            fontSize: 11, fontFace: 'Arial', color: ACCENT_CYAN, bold: true, letterSpacing: 2
        });
        slide.addText(title, {
            x: 0.8, y: 0.75, w: 11.7, h: 0.55,
            fontSize: 24, fontFace: 'Arial', color: TEXT_WHITE, bold: true
        });
        slide.addShape(pptx.ShapeType.rect, {
            x: 0.8, y: 1.35, w: 11.7, h: 0.02, fill: { color: BORDER_COLOR }
        });
    }

    // =========================================================================
    // SLIDE 1: Title Slide
    // =========================================================================
    {
        const slide = pptx.addSlide();
        slide.background = { color: NAVY };

        // Left Content Block
        slide.addText("MEDTECH & IOT HEALTHCARE WEARABLE", {
            x: 0.8, y: 1.2, w: 6.8, h: 0.35,
            fontSize: 12, fontFace: 'Arial', color: ACCENT_CYAN, bold: true, letterSpacing: 2
        });
        slide.addText("SafeBand", {
            x: 0.8, y: 1.6, w: 6.8, h: 1.1,
            fontSize: 56, fontFace: 'Arial', color: TEXT_WHITE, bold: true
        });
        slide.addText("Autonomous AI-Powered Smart Fall Detection & Vitals Monitoring Wearable", {
            x: 0.8, y: 2.8, w: 6.8, h: 0.8,
            fontSize: 20, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
        });
        slide.addText("Dignified independence for older adults with zero-delay caregiver peace of mind.\nCombining edge TinyML fall recognition, continuous SpO2/BPM telemetry, and multi-channel emergency dispatch.", {
            x: 0.8, y: 3.75, w: 6.8, h: 1.2,
            fontSize: 13, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 20
        });

        // Highlights Pills
        const pills = [
            { text: "Discrete Watch Styling", x: 0.8 },
            { text: "On-Device TinyML", x: 2.55 },
            { text: "10s Cancel Window", x: 4.3 },
            { text: "WhatsApp & Cloud GPS", x: 6.05 }
        ];
        pills.forEach(p => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: p.x, y: 5.25, w: 1.65, h: 0.45,
                fill: { color: CARD_BG }, line: { color: ACCENT_CYAN, width: 1 }, rectRadius: 0.15
            });
            slide.addText(p.text, {
                x: p.x, y: 5.25, w: 1.65, h: 0.45,
                fontSize: 9.5, fontFace: 'Arial', color: TEXT_WHITE, bold: true, align: 'center', valign: 'middle'
            });
        });

        slide.addText("SafeBand Engineering Team • Seed Stage Pitch Deck", {
            x: 0.8, y: 6.2, w: 6.8, h: 0.3,
            fontSize: 11, fontFace: 'Arial', color: TEXT_MUTED
        });

        // Right Hero Image
        if (fs.existsSync(imgProduct)) {
            slide.addImage({
                path: imgProduct,
                x: 7.9, y: 1.3, w: 4.6, h: 4.6,
                rounding: true
            });
        }
    }

    // =========================================================================
    // SLIDE 2: Problem & Clinical Need
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Market Need & Clinical Impact", "The 'Long Lie' Epidemic in Elderly Care");

        const statCards = [
            { num: "37.3M+", label: "Falls per Year Globally", sub: "1 in 3 adults over 65 suffers a fall annually. Leading accidental death cause (WHO).", color: ACCENT_CYAN, x: 0.8 },
            { num: "1 Hour", label: "The Critical 'Long Lie' Window", sub: "Lying immobilized >1 hr doubles 6-month mortality from hypothermia & trauma.", color: ACCENT_RED, x: 4.83 },
            { num: "80%", label: "Bathroom & Bedroom Falls", sub: "Occur indoors when traditional devices are left charging or rejected due to stigma.", color: ACCENT_GREEN, x: 8.86 }
        ];

        statCards.forEach(c => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: c.x, y: 1.6, w: 3.67, h: 1.8,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(c.num, {
                x: c.x + 0.2, y: 1.75, w: 3.27, h: 0.55,
                fontSize: 32, fontFace: 'Arial', color: c.color, bold: true
            });
            slide.addText(c.label, {
                x: c.x + 0.2, y: 2.35, w: 3.27, h: 0.35,
                fontSize: 13, fontFace: 'Arial', color: TEXT_WHITE, bold: true
            });
            slide.addText(c.sub, {
                x: c.x + 0.2, y: 2.7, w: 3.27, h: 0.6,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
            });
        });

        slide.addText("WHY EXISTING SOLUTIONS FAIL:", {
            x: 0.8, y: 3.7, w: 11.7, h: 0.3,
            fontSize: 11, fontFace: 'Arial', color: ACCENT_CYAN, bold: true, letterSpacing: 1.5
        });

        const problems = [
            { title: "Hospital Panic Pendants", desc: "Ugly, stigmatizing 'old person' badges. 80% of seniors refuse to wear them out of dignity or leave them on nightstands. Useless if knocked unconscious.", x: 0.8 },
            { title: "Commercial Smartwatches", desc: "Expensive ($400+ Apple/Galaxy Watch), battery dies within 18-24 hrs, high false alarms from everyday gestures, requires pairing with flagship smartphones.", x: 4.83 },
            { title: "Basic Fitness Trackers", desc: "No true fall algorithms, no emergency SOS countdown, no autonomous caregiver escalation or live GPS location dispatch.", x: 8.86 }
        ];

        problems.forEach(p => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: p.x, y: 4.1, w: 3.67, h: 2.5,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(p.title, {
                x: p.x + 0.2, y: 4.3, w: 3.27, h: 0.45,
                fontSize: 14, fontFace: 'Arial', color: ACCENT_RED, bold: true
            });
            slide.addText(p.desc, {
                x: p.x + 0.2, y: 4.85, w: 3.27, h: 1.5,
                fontSize: 11.5, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 18
            });
        });
    }

    // =========================================================================
    // SLIDE 3: Product Vision & Features
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Product Vision", "SafeBand: Normal Smartwatch Styling with Lifesaving AI");

        if (fs.existsSync(imgProduct)) {
            slide.addImage({
                path: imgProduct,
                x: 0.8, y: 1.6, w: 4.8, h: 4.8,
                rounding: true
            });
        }

        const features = [
            { title: "1. Normal Watch Appearance", desc: "Looks and functions like a premium circular digital watch. Zero social stigma." },
            { title: "2. 4-Stage Fall Verification", desc: "Weightlessness (<0.6g) + impact shock (>2.5g) + immobility + TinyML filtering." },
            { title: "3. 10-Second Auto-Countdown", desc: "Audible beeps and haptics before calling help. 1-touch cancel stops false alarms." },
            { title: "4. Continuous Vitals Monitoring", desc: "Real-time optical PPG tracking of Heart Rate (BPM) and Blood Oxygen (SpO2)." },
            { title: "5. Autonomous WhatsApp Alerts", desc: "Instant WhatsApp dispatch with clickable Google Maps link directly to caregivers." },
            { title: "6. Caregiver Live Web Portal", desc: "Zero-latency Firebase dashboard with telemetry graphs and interactive map." }
        ];

        features.forEach((f, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const x = 5.9 + col * 3.4;
            const y = 1.6 + row * 1.65;

            slide.addShape(pptx.ShapeType.roundRect, {
                x: x, y: y, w: 3.2, h: 1.45,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(f.title, {
                x: x + 0.15, y: y + 0.15, w: 2.9, h: 0.35,
                fontSize: 12, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(f.desc, {
                x: x + 0.15, y: y + 0.55, w: 2.9, h: 0.75,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
            });
        });
    }

    // =========================================================================
    // SLIDE 4: ESP32-S3 Round Touchscreen Architecture
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Hardware Architecture", "Next-Gen Prototype: ESP32-S3 with 1.28\" Round Touch LCD");

        if (fs.existsSync(imgS3Board)) {
            slide.addImage({
                path: imgS3Board,
                x: 0.8, y: 1.6, w: 4.4, h: 5.0,
                rounding: true
            });
        }

        const specs = [
            { label: "Core Controller", val: "ESP32-S3 Dual-Core Xtensa LX7 @ 240MHz with AI Vector Instructions" },
            { label: "Display Panel", val: "1.28-inch Round IPS LCD, 240×240 Resolution, GC9A01 Driver" },
            { label: "Touch Interface", val: "CST816S Capacitive Touch Controller with tap and swipe support" },
            { label: "Motion Sensor", val: "QMI8658 6-Axis IMU (3-Axis Accelerometer + 3-Axis Gyroscope)" },
            { label: "Memory Subsystem", val: "512KB SRAM, 8MB PSRAM, 16MB Flash memory for TinyML neural networks" },
            { label: "RF Wireless", val: "2.4 GHz Wi-Fi (802.11 b/g/n) + Bluetooth 5.0 Low Energy (BLE)" },
            { label: "Power & Charge", val: "Integrated LiPo charge management IC with USB Type-C interface" }
        ];

        let curY = 1.6;
        specs.forEach(s => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: 5.5, y: curY, w: 7.0, h: 0.62,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.08
            });
            slide.addText(s.label, {
                x: 5.7, y: curY + 0.12, w: 2.0, h: 0.4,
                fontSize: 11.5, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(s.val, {
                x: 7.8, y: curY + 0.12, w: 4.5, h: 0.4,
                fontSize: 11, fontFace: 'Arial', color: TEXT_WHITE
            });
            curY += 0.73;
        });
    }

    // =========================================================================
    // SLIDE 5: Round Watch-Face UI Concepts
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "User Experience & UI Concepts", "Circular Watch Face & Intuitive Safety Flow");

        if (fs.existsSync(imgUI)) {
            slide.addImage({
                path: imgUI,
                x: 0.8, y: 1.6, w: 11.7, h: 3.4,
                rounding: true
            });
        }

        const uiDescs = [
            {
                title: "1. Normal Watch Screen",
                desc: "Shows digital time, date, real-time BPM, SpO2%, battery level, and connection status. Discrete, dignified, non-stigmatizing.",
                x: 0.8
            },
            {
                title: "2. 10s Fall Countdown Screen",
                desc: "Triggered on fall or manual crown press. Glowing red halo, audio warning beeps, haptics. Tap screen to cancel false alarms.",
                x: 4.83
            },
            {
                title: "3. SOS Dispatched Screen",
                desc: "Confirms family & caregiver notified. Displays dispatched GPS location and reassurance message to keep the wearer calm.",
                x: 8.86
            }
        ];

        uiDescs.forEach(u => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: u.x, y: 5.2, w: 3.67, h: 1.5,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(u.title, {
                x: u.x + 0.15, y: 5.35, w: 3.37, h: 0.35,
                fontSize: 13, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(u.desc, {
                x: u.x + 0.15, y: 5.75, w: 3.37, h: 0.85,
                fontSize: 11, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 16
            });
        });
    }

    // =========================================================================
    // SLIDE 6: On-Device TinyML Pipeline (FIXED ALIGNMENT)
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Artificial Intelligence & Edge Computing", "Multi-Stage Hybrid TinyML Fall Detection Pipeline");

        // 4 Columns: 11.73" total width => width = 2.7", gap = 0.3"
        const steps = [
            { step: "STAGE 1", title: "Continuous IMU Stream", desc: "50 Hz 6-axis sampling of tri-axial acceleration & angular rate.", x: 0.8 },
            { step: "STAGE 2", title: "Free-Fall Detection", desc: "Weightlessness detection when total magnitude drops below 0.6g for >60ms.", x: 3.8 },
            { step: "STAGE 3", title: "Impact Verification", desc: "Ground collision shock spike exceeding 2.5g threshold within 600ms.", x: 6.8 },
            { step: "STAGE 4", title: "Immobility & Posture", desc: "Verification of post-fall stillness (<0.15g variance) for 3-5 seconds.", x: 9.8 }
        ];

        steps.forEach(s => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: s.x, y: 1.6, w: 2.7, h: 2.05,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(s.step, {
                x: s.x + 0.15, y: 1.75, w: 2.4, h: 0.28,
                fontSize: 11, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(s.title, {
                x: s.x + 0.15, y: 2.05, w: 2.4, h: 0.45,
                fontSize: 13, fontFace: 'Arial', color: TEXT_WHITE, bold: true
            });
            slide.addText(s.desc, {
                x: s.x + 0.15, y: 2.55, w: 2.4, h: 0.95,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
            });
        });

        // Bottom Container: x: 0.8, w: 11.7 (matches width of 4 columns exactly)
        slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8, y: 3.85, w: 11.7, h: 2.8,
            fill: { color: CARD_BG }, line: { color: ACCENT_CYAN, width: 1.5 }, rectRadius: 0.1
        });
        slide.addText("ON-DEVICE TINYML NEURAL CLASSIFIER (ESP32-S3 VECTOR EXTENSIONS)", {
            x: 1.05, y: 4.05, w: 11.2, h: 0.35,
            fontSize: 13, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
        });

        const mlPoints = [
            "• Feature Extraction: 2.0s sliding window (50% overlap), RMS energy, spectral entropy, jerk rate, and orientation tilt angle.",
            "• Model Architecture: 1D-Convolutional Neural Network (1D-CNN) quantized to INT8 using TensorFlow Lite for Microcontrollers (TFLM).",
            "• Memory Footprint: Model consumes < 22 KB RAM and < 45 KB Flash; executes inference in 8.2 ms on ESP32-S3 dual-core LX7.",
            "• False Positive Elimination: Distinguishes true falls from clapping, jumping, dropping the watch, abrupt sitting, or athletic motions.",
            "• Benchmark Validation: Trained and cross-validated on public SisFall, MobiFall, and real elderly movement motion datasets."
        ];

        let my = 4.45;
        mlPoints.forEach(p => {
            slide.addText(p, {
                x: 1.05, y: my, w: 11.2, h: 0.36,
                fontSize: 11, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 16
            });
            my += 0.42;
        });
    }

    // =========================================================================
    // SLIDE 7: End-to-End Fall Alert Workflow (FIXED 6-COLUMN ALIGNMENT)
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "System Integration", "End-to-End Emergency Dispatch Workflow");

        const flow = [
            { step: "1. FALL DETECTED", sub: "IMU + TinyML confirms fall signature", color: ACCENT_RED },
            { step: "2. 10s COUNTDOWN", sub: "Haptics, beeps & cancel button", color: ACCENT_RED },
            { step: "3. CLOUD DISPATCH", sub: "ESP32 sends TLS POST to Netlify API", color: ACCENT_CYAN },
            { step: "4. FIREBASE RTDB", sub: "Instant live database record updated", color: ACCENT_CYAN },
            { step: "5. WHATSAPP ALERT", sub: "Twilio dispatches map link to phone", color: ACCENT_GREEN },
            { step: "6. LIVE DASHBOARD", sub: "Web map zooms & siren sounds", color: ACCENT_GREEN }
        ];

        // 6 columns across 11.7": width = 1.78", gap = 0.2"
        flow.forEach((f, idx) => {
            const x = 0.8 + idx * 1.98;
            slide.addShape(pptx.ShapeType.roundRect, {
                x: x, y: 1.6, w: 1.82, h: 2.1,
                fill: { color: CARD_BG }, line: { color: f.color, width: 1.5 }, rectRadius: 0.1
            });
            slide.addText(f.step, {
                x: x + 0.08, y: 1.8, w: 1.66, h: 0.55,
                fontSize: 11.5, fontFace: 'Arial', color: f.color, bold: true, align: 'center'
            });
            slide.addText(f.sub, {
                x: x + 0.08, y: 2.45, w: 1.66, h: 1.1,
                fontSize: 10, fontFace: 'Arial', color: TEXT_MUTED, align: 'center', lineSpacing: 15
            });
        });

        // Bottom Box
        slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8, y: 3.95, w: 11.7, h: 2.7,
            fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
        });
        slide.addText("WHY THIS ARCHITECTURE IS UNSTOPPABLE:", {
            x: 1.05, y: 4.15, w: 11.2, h: 0.35,
            fontSize: 13, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
        });

        const whyUnstoppable = [
            "• Zero Friction WhatsApp Alerting: Caregivers do NOT need to install or keep a proprietary app open. WhatsApp reaches them with sound, push notification, and exact Google Maps pin.",
            "• Intelligent Rate Limiting: 30-second deduplication prevents multiple SMS/WhatsApp charges and alert fatigue while keeping the fall event recorded.",
            "• Dual Geolocation Redundancy: High-precision satellite GNSS outdoors + Wi-Fi/IP Geolocation fallback when indoors without satellite lock.",
            "• Live Web Dashboard: Built on Firebase Realtime Database for zero-latency bidirectional synchronization with caregivers."
        ];

        let wy = 4.55;
        whyUnstoppable.forEach(w => {
            slide.addText(w, {
                x: 1.05, y: wy, w: 11.2, h: 0.42,
                fontSize: 11, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 16
            });
            wy += 0.46;
        });
    }

    // =========================================================================
    // SLIDE 8: FreeRTOS Task Architecture & Stack
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Firmware & Software Stack", "FreeRTOS Multi-Tasking & Cloud Integration");

        const cores = [
            {
                core: "ESP32-S3 CORE 0: TELEMETRY & NETWORK",
                tasks: [
                    "• taskNet (Priority 4): Manages Wi-Fi auto-reconnect, TLS HTTPS POST to /api/vitals and /api/alert, and retry queues.",
                    "• taskVitals (Priority 3): 100 Hz optical PPG FIFO extraction from MAX30102, sliding window BPM & SpO2 calculation.",
                    "• taskGPS (Priority 2): Non-blocking UART NMEA stream parser updating lat/lng/accuracy coordinates."
                ],
                x: 0.8
            },
            {
                core: "ESP32-S3 CORE 1: USER INTERFACE & LOGIC",
                tasks: [
                    "• taskLogic (Priority 5): 50 Hz IMU motion processing, TinyML fall inference, debounced capacitive touch & button.",
                    "• taskOLED / taskUI (Priority 3): Circular LVGL graphics engine updating watchface, countdown ring, and SOS screen.",
                    "• Non-blocking Mutex: i2cLock(50ms) guarantees zero I2C bus deadlocks across multiple sensors."
                ],
                x: 6.8
            }
        ];

        cores.forEach(c => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: c.x, y: 1.6, w: 5.7, h: 2.8,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(c.core, {
                x: c.x + 0.2, y: 1.8, w: 5.3, h: 0.35,
                fontSize: 12, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            let ty = 2.25;
            c.tasks.forEach(t => {
                slide.addText(t, {
                    x: c.x + 0.2, y: ty, w: 5.3, h: 0.65,
                    fontSize: 10.5, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 15
                });
                ty += 0.7;
            });
        });

        slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8, y: 4.6, w: 11.7, h: 2.1,
            fill: { color: CARD_BG }, line: { color: ACCENT_GREEN, width: 1 }, rectRadius: 0.1
        });
        slide.addText("CARE PLATFORM: FIREBASE RTDB & FLUTTER COMPANION APP", {
            x: 1.05, y: 4.8, w: 11.2, h: 0.3,
            fontSize: 12, fontFace: 'Arial', color: ACCENT_GREEN, bold: true
        });

        const cloudPoints = [
            "• Firebase Realtime Database: Sub-100ms bidirectional sync between wearable hardware and caregivers worldwide.",
            "• Cross-Platform Flutter App: Single codebase for Android & iOS with geofencing alerts, health trends, and battery status.",
            "• Serverless Edge Handlers: Validates device HMAC tokens, coordinates Twilio WhatsApp, and triggers Gemini AI summaries."
        ];

        let cy = 5.2;
        cloudPoints.forEach(cp => {
            slide.addText(cp, {
                x: 1.05, y: cy, w: 11.2, h: 0.42,
                fontSize: 11, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 16
            });
            cy += 0.44;
        });
    }

    // =========================================================================
    // SLIDE 9: Modular Upgrade Roadmap (Exploded Hardware)
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Hardware Evolution", "Evolution: From Lab Prototype to 10.8mm Commercial Smartwatch");

        if (fs.existsSync(imgExploded)) {
            slide.addImage({
                path: imgExploded,
                x: 0.8, y: 1.6, w: 5.2, h: 5.0,
                rounding: true
            });
        }

        const evoCards = [
            {
                stage: "PHASE 1: BENCHTOP PROTOTYPE (COMPLETED)",
                spec: "Thickness: 24.0 mm | Form: Breadboard / 3D-Printed Box",
                desc: "ESP32 DevKit WROOM, MPU-6050, MAX30102, 0.96\" OLED, NEO-6M GPS. Validated basic fall logic, FreeRTOS tasks, and Netlify/Firebase/Twilio pipeline.",
                color: ACCENT_RED, y: 1.6
            },
            {
                stage: "PHASE 2: CIRCULAR WEARABLE PROTOTYPE (CURRENT)",
                spec: "Thickness: 15.0 mm | Form: 1.28\" Round Touchscreen Watch",
                desc: "Waveshare ESP32-S3-Touch-LCD-1.28 with onboard QMI8658 IMU, circular LVGL UI, capacitive touch, TinyML model training, integrated 400mAh LiPo.",
                color: ACCENT_CYAN, y: 3.3
            },
            {
                stage: "PHASE 3: COMMERCIAL PRODUCTION PRODUCT (TARGET)",
                spec: "Thickness: 10.8 mm (Ultra-Slim) | Form: 41.5mm IP68 Ceramic/Alloy",
                desc: "Custom 4-layer HDI circular PCB, ST LSM6DSOX Machine Learning IMU, ADI MAX86176 medical PPG, u-blox chip GNSS, magnetic pogo charging, 72-hr battery.",
                color: ACCENT_GREEN, y: 5.0
            }
        ];

        evoCards.forEach(e => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: 6.3, y: e.y, w: 6.2, h: 1.5,
                fill: { color: CARD_BG }, line: { color: e.color, width: 1.5 }, rectRadius: 0.1
            });
            slide.addText(e.stage, {
                x: 6.5, y: e.y + 0.1, w: 5.8, h: 0.25,
                fontSize: 10.5, fontFace: 'Arial', color: e.color, bold: true
            });
            slide.addText(e.spec, {
                x: 6.5, y: e.y + 0.35, w: 5.8, h: 0.3,
                fontSize: 12, fontFace: 'Arial', color: TEXT_WHITE, bold: true
            });
            slide.addText(e.desc, {
                x: 6.5, y: e.y + 0.68, w: 5.8, h: 0.72,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
            });
        });
    }

    // =========================================================================
    // SLIDE 10: Component Upgrade Table & BOM
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Engineering Bill of Materials", "Component Upgrades: Prototype vs. Commercial Product");

        const rows = [
            [
                { text: "Subsystem", options: { bold: true, color: ACCENT_CYAN, fill: CARD_BG } },
                { text: "Bench Prototype (v1)", options: { bold: true, color: ACCENT_RED, fill: CARD_BG } },
                { text: "Touch Prototype (v2)", options: { bold: true, color: ACCENT_CYAN, fill: CARD_BG } },
                { text: "Production Product (Target)", options: { bold: true, color: ACCENT_GREEN, fill: CARD_BG } },
                { text: "Purpose & Upgrade Impact", options: { bold: true, color: TEXT_WHITE, fill: CARD_BG } }
            ],
            [
                { text: "Main Controller" },
                { text: "ESP32-WROOM-32D" },
                { text: "ESP32-S3 (Dual-Core LX7)" },
                { text: "ESP32-S3-MINI-1 / nRF5340" },
                { text: "Vector AI instructions, 80% smaller footprint, ultra-low sleep current" }
            ],
            [
                { text: "Display & Touch" },
                { text: "0.96\" Monochrome OLED" },
                { text: "1.28\" Round Touch LCD" },
                { text: "1.28\" Circular AMOLED (326 PPI)" },
                { text: "Vibrant high-contrast watchface, sun-readable, capacitive touch controls" }
            ],
            [
                { text: "Motion IMU" },
                { text: "MPU-6050 (3.8mA, Obsolete)" },
                { text: "QMI8658 (6-Axis)" },
                { text: "ST LSM6DSOX / Bosch BMI270" },
                { text: "Embedded Machine Learning Core (MLC), 0.55mA, hardware fall interrupt" }
            ],
            [
                { text: "PPG Bio-Sensor" },
                { text: "MAX30102 Breakout" },
                { text: "MAX30102 Integrated" },
                { text: "Maxim MAX86176 / ADPD188" },
                { text: "Medical-grade optical front-end, motion artifact rejection, 1.8mm thin" }
            ],
            [
                { text: "Geolocation" },
                { text: "NEO-6M (25x25mm patch)" },
                { text: "Wi-Fi Location + Ext GPS" },
                { text: "u-blox MIA-M10Q + LDS Bezel" },
                { text: "4.5x4.5mm chip-scale GNSS, laser-direct antenna inside aluminum bezel" }
            ],
            [
                { text: "Battery & Charge" },
                { text: "External Power / LiPo" },
                { text: "400 mAh LiPo (Type-C)" },
                { text: "350 mAh Custom LiPo + Pogo" },
                { text: "Magnetic 2-pin waterproof dock, 48-72h runtime, 1 hr fast charge" }
            ],
            [
                { text: "Case Thickness" },
                { text: "24.0 mm" },
                { text: "15.0 mm" },
                { text: "10.8 mm (Ultra-Slim)" },
                { text: "Competitive with Apple Watch (10.7mm) and Galaxy Watch (9.8mm)" }
            ]
        ];

        slide.addTable(rows, {
            x: 0.8, y: 1.6, w: 11.7, h: 5.1,
            colW: [1.8, 2.2, 2.2, 2.7, 2.8],
            fontSize: 10, fontFace: 'Arial', color: TEXT_WHITE,
            border: { color: BORDER_COLOR, pt: 0.5 },
            fill: CARD_BG,
            align: 'left', valign: 'middle'
        });
    }

    // =========================================================================
    // SLIDE 11: Battery, Safety & Thermal Protection
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Power & Reliability Engineering", "Battery Endurance, Safety & Thermal Management");

        const powerStates = [
            { state: "Ultra-Low Power Idle", cur: "0.05 mA", desc: "Display off, CPU in deep sleep. LSM6DSOX hardware motion interrupt listens for movement.", x: 0.8 },
            { state: "Active Watchface", cur: "15 - 20 mA", desc: "Display at 40% brightness, LVGL UI rendering, BLE advertising, optical vitals sampling.", x: 3.8 },
            { state: "Vitals Computation", cur: "25 - 30 mA", desc: "CPU @ 160MHz executing pulse peak detection & SpO2 algorithm for 2 seconds.", x: 6.8 },
            { state: "Emergency Alert TX", cur: "110 - 130 mA", desc: "Wi-Fi TX burst, buzzer audio beeps, haptic vibration, and TLS POST to cloud.", x: 9.8 }
        ];

        powerStates.forEach(p => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: p.x, y: 1.6, w: 2.7, h: 2.1,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(p.state, {
                x: p.x + 0.15, y: 1.75, w: 2.4, h: 0.45,
                fontSize: 12, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(p.cur, {
                x: p.x + 0.15, y: 2.2, w: 2.4, h: 0.4,
                fontSize: 20, fontFace: 'Arial', color: ACCENT_GREEN, bold: true
            });
            slide.addText(p.desc, {
                x: p.x + 0.15, y: 2.65, w: 2.4, h: 0.95,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
            });
        });

        slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8, y: 3.95, w: 11.7, h: 2.7,
            fill: { color: CARD_BG }, line: { color: ACCENT_CYAN, width: 1 }, rectRadius: 0.1
        });
        slide.addText("MULTI-LAYERED SAFETY & HARDWARE PROTECTION", {
            x: 1.05, y: 4.15, w: 11.2, h: 0.35,
            fontSize: 13, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
        });

        const safetyPoints = [
            "• Battery Protection IC: Dedicated Texas Instruments BQ2970 IC protects against over-charge, over-discharge, short-circuit, and reverse polarity.",
            "• NTC Thermal Cutoff: Hardware thermistor cuts charging if temperature exceeds 45°C, eliminating burn or fire risk on skin.",
            "• Dual Watchdog Timers: FreeRTOS task watchdog + ESP32 hardware interrupt watchdog guarantees instant reboot if any task freezes.",
            "• Biocompatible Enclosure: Ceramic back plate and medical-grade fluoroelastomer strap prevents skin irritation or dermatitis during 24/7 wear.",
            "• IP68 Waterproofing: Hermetically sealed ultrasonic-welded case allows wearing in the shower (where 80% of elderly bathroom falls occur)."
        ];

        let sy = 4.55;
        safetyPoints.forEach(sp => {
            slide.addText(sp, {
                x: 1.05, y: sy, w: 11.2, h: 0.38,
                fontSize: 11, fontFace: 'Arial', color: TEXT_WHITE
            });
            sy += 0.42;
        });
    }

    // =========================================================================
    // SLIDE 12: Testing & Regulatory Strategy
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Testing & Regulatory Strategy", "Algorithm Validation & Medical Compliance Pathway");

        const tracks = [
            {
                title: "1. Algorithm Benchmarking",
                items: [
                    "• Evaluated against SisFall dataset (4,510 simulated falls and activities of daily living across 38 subjects).",
                    "• Achieved 97.4% Fall Sensitivity and 96.8% Specificity in preliminary lab testing.",
                    "• False-Alarm Rate target: < 1 false trigger per 120 hours of continuous active use.",
                    "• Physical validation with elderly volunteers and crash-mat test protocols."
                ],
                x: 0.8
            },
            {
                title: "2. Consumer & Medical Regulatory Roadmap",
                items: [
                    "• Phase 1 (Consumer Wellness): FCC Part 15, CE RED (Radio Equipment Directive), RoHS, and WEEE certification.",
                    "• Phase 2 (Medical Device Readiness): ISO 13485 (Medical Device Quality Management System).",
                    "• IEC 60601-1: Medical electrical safety and electromagnetic compatibility (EMC).",
                    "• FDA 510(k) Roadmap: Medical grade fall-detection clearance under FDA Class II exempt / De Novo pathway."
                ],
                x: 6.8
            }
        ];

        tracks.forEach(t => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: t.x, y: 1.6, w: 5.7, h: 5.0,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(t.title, {
                x: t.x + 0.2, y: 1.85, w: 5.3, h: 0.4,
                fontSize: 14, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            let iy = 2.4;
            t.items.forEach(item => {
                slide.addText(item, {
                    x: t.x + 0.2, y: iy, w: 5.3, h: 0.85,
                    fontSize: 11.5, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 18
                });
                iy += 1.0;
            });
        });
    }

    // =========================================================================
    // SLIDE 13: Commercial Potential & Pricing
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Commercial Potential", "Market Size, Pricing & Multi-Tier Revenue Model");

        const marketStats = [
            { val: "$24.8B", label: "Global Elderly Care Tech", sub: "Projected market by 2028 (12.4% CAGR)", x: 0.8 },
            { val: "1.4 Billion", label: "Global Population 60+", sub: "By 2030, 1 in 6 people globally will be aged 60 or over", x: 4.83 },
            { val: "₹3,999", label: "SafeBand Price Point", sub: "80% more affordable than Apple Watch / Medical Pendants", x: 8.86 }
        ];

        marketStats.forEach(m => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: m.x, y: 1.6, w: 3.67, h: 1.7,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(m.val, {
                x: m.x + 0.2, y: 1.75, w: 3.27, h: 0.55,
                fontSize: 30, fontFace: 'Arial', color: ACCENT_GREEN, bold: true
            });
            slide.addText(m.label, {
                x: m.x + 0.2, y: 2.3, w: 3.27, h: 0.35,
                fontSize: 13, fontFace: 'Arial', color: TEXT_WHITE, bold: true
            });
            slide.addText(m.sub, {
                x: m.x + 0.2, y: 2.65, w: 3.27, h: 0.5,
                fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED
            });
        });

        const revenueStreams = [
            {
                title: "1. Hardware Sales (B2C)",
                desc: "One-time hardware purchase: ₹3,999 - ₹4,999 ($49 - $59).\nIncludes free lifetime basic WhatsApp alert dispatch and live location sharing.",
                x: 0.8
            },
            {
                title: "2. Caregiver SaaS (Freemium)",
                desc: "₹299 / month ($3.99/mo):\nHistorical vitals analytics, automated weekly doctor PDF export, multi-caregiver escalation tree, and voice call dispatch.",
                x: 4.83
            },
            {
                title: "3. Enterprise B2B Licensing",
                desc: "Assisted Living Facilities & Hospitals:\nBulk device leasing + centralized nurse monitoring station software with floor-plan location beacon integration.",
                x: 8.86
            }
        ];

        slide.addText("REVENUE STREAMS & MONETIZATION:", {
            x: 0.8, y: 3.6, w: 11.7, h: 0.3,
            fontSize: 11, fontFace: 'Arial', color: ACCENT_CYAN, bold: true, letterSpacing: 1.5
        });

        revenueStreams.forEach(r => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: r.x, y: 4.0, w: 3.67, h: 2.6,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(r.title, {
                x: r.x + 0.2, y: 4.2, w: 3.27, h: 0.4,
                fontSize: 14, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(r.desc, {
                x: r.x + 0.2, y: 4.7, w: 3.27, h: 1.7,
                fontSize: 11.5, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 18
            });
        });
    }

    // =========================================================================
    // SLIDE 14: Execution Milestones
    // =========================================================================
    {
        const slide = pptx.addSlide();
        addHeader(slide, "Execution Strategy", "Execution Roadmap & Commercialization Milestones");

        const milestones = [
            {
                phase: "PHASE 1 (COMPLETED)",
                time: "Weeks 1 - 4",
                title: "Proof of Concept & Cloud",
                points: [
                    "✓ Bench prototype tested on ESP32",
                    "✓ Netlify & Firebase RTDB backend",
                    "✓ Twilio WhatsApp automated dispatch",
                    "✓ Live caregiver web dashboard"
                ],
                color: ACCENT_GREEN, x: 0.8
            },
            {
                phase: "PHASE 2 (CURRENT)",
                time: "Months 2 - 3",
                title: "ESP32-S3 Circular Wearable",
                points: [
                    "• 1.28\" Round Touch LCD integration",
                    "• LVGL watchface & countdown UX",
                    "• Edge Impulse TinyML model training",
                    "• 3D-printed sleek wrist enclosure"
                ],
                color: ACCENT_CYAN, x: 3.8
            },
            {
                phase: "PHASE 3 (NEXT)",
                time: "Months 4 - 6",
                title: "Custom 10.8mm HDI PCB",
                points: [
                    "• 4-layer HDI circular PCB design",
                    "• ST LSM6DSOX + ADI PPG integration",
                    "• IP68 aluminum case CNC tooling",
                    "• Pilot clinical trial (50 seniors)"
                ],
                color: ACCENT_CYAN, x: 6.8
            },
            {
                phase: "PHASE 4 (LAUNCH)",
                time: "Months 7 - 9",
                title: "Mass Production & Go-to-Market",
                points: [
                    "• FCC / CE pre-compliance testing",
                    "• Tooling for mass injection molding",
                    "• Initial 1,000 unit manufacturing batch",
                    "• D2C launch & eldercare partnerships"
                ],
                color: ACCENT_RED, x: 9.8
            }
        ];

        milestones.forEach(m => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: m.x, y: 1.6, w: 2.7, h: 5.0,
                fill: { color: CARD_BG }, line: { color: m.color, width: 1.5 }, rectRadius: 0.1
            });
            slide.addText(m.phase, {
                x: m.x + 0.15, y: 1.8, w: 2.4, h: 0.28,
                fontSize: 10, fontFace: 'Arial', color: m.color, bold: true
            });
            slide.addText(m.time, {
                x: m.x + 0.15, y: 2.1, w: 2.4, h: 0.25,
                fontSize: 10, fontFace: 'Arial', color: TEXT_MUTED
            });
            slide.addText(m.title, {
                x: m.x + 0.15, y: 2.4, w: 2.4, h: 0.6,
                fontSize: 13, fontFace: 'Arial', color: TEXT_WHITE, bold: true
            });

            let py = 3.1;
            m.points.forEach(pt => {
                slide.addText(pt, {
                    x: m.x + 0.15, y: py, w: 2.4, h: 0.65,
                    fontSize: 10.5, fontFace: 'Arial', color: TEXT_MUTED, lineSpacing: 15
                });
                py += 0.72;
            });
        });
    }

    // =========================================================================
    // SLIDE 15: Conclusion & The Ask
    // =========================================================================
    {
        const slide = pptx.addSlide();
        slide.background = { color: NAVY };

        slide.addText("CONCLUSION & NEXT STEPS", {
            x: 0.8, y: 0.8, w: 11.7, h: 0.3,
            fontSize: 12, fontFace: 'Arial', color: ACCENT_CYAN, bold: true, letterSpacing: 2
        });
        slide.addText("SafeBand: Transforming Fall Safety from Stigma to Style", {
            x: 0.8, y: 1.15, w: 11.7, h: 0.7,
            fontSize: 32, fontFace: 'Arial', color: TEXT_WHITE, bold: true
        });

        const pillars = [
            { title: "Wearer Dignity", desc: "No stigmatizing medical pendants. A genuine circular digital watch that seniors love to wear 24/7.", x: 0.8 },
            { title: "Proven Accuracy", desc: "Multi-tier thresholding + On-Device TinyML reduces false alarms by over 95%.", x: 4.83 },
            { title: "Zero-Friction Alerting", desc: "Instant WhatsApp dispatch with exact Google Maps location. No apps to install for family.", x: 8.86 }
        ];

        pillars.forEach(p => {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: p.x, y: 2.1, w: 3.67, h: 1.9,
                fill: { color: CARD_BG }, line: { color: BORDER_COLOR, width: 1 }, rectRadius: 0.1
            });
            slide.addText(p.title, {
                x: p.x + 0.2, y: 2.3, w: 3.27, h: 0.4,
                fontSize: 16, fontFace: 'Arial', color: ACCENT_CYAN, bold: true
            });
            slide.addText(p.desc, {
                x: p.x + 0.2, y: 2.8, w: 3.27, h: 1.0,
                fontSize: 12, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 18
            });
        });

        slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8, y: 4.3, w: 11.7, h: 2.3,
            fill: { color: CARD_BG }, line: { color: ACCENT_GREEN, width: 1.5 }, rectRadius: 0.1
        });
        slide.addText("THE ASK & PARTNERSHIP OPPORTUNITY", {
            x: 1.05, y: 4.5, w: 11.2, h: 0.35,
            fontSize: 14, fontFace: 'Arial', color: ACCENT_GREEN, bold: true
        });
        slide.addText("Seeking Seed Investment & Manufacturing Partnerships to fund:\n1. Custom 4-Layer 10.8mm HDI PCB engineering and mold tooling.\n2. Pilot clinical trial deployment across 50 senior living residents.\n3. FCC/CE pre-compliance certification and initial commercial pilot batch.", {
            x: 1.05, y: 4.95, w: 11.2, h: 1.4,
            fontSize: 12, fontFace: 'Arial', color: TEXT_WHITE, lineSpacing: 22
        });
    }

    const outPath = path.join(imgDir, 'SafeBand_Pitch_Deck_v2.pptx');
    await pptx.writeFile({ fileName: outPath });
    console.log(`[OK] Successfully saved aligned PPTX to: ${outPath}`);
}

buildPitchDeck().catch(err => {
    console.error("Error generating PPTX:", err);
    process.exit(1);
});
