# 💧 MajiSmart — AI-Powered Water Intelligence Platform

> **USIU-Africa Innovation Challenge 2026** · SDG 6 (Clean Water) · SDG 11 (Sustainable Cities)

MajiSmart is a real-time water monitoring platform that uses machine learning to detect leaks, eliminate false positives through Farmer Mode scheduling, predict monthly bills, and benchmark household water usage against the community — all from a single sensor per pipe.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MajiSmart Stack                     │
├──────────────┬──────────────┬──────────────┬────────────┤
│  simulator/  │  ai-engine/  │  backend/    │  frontend/ │
│              │              │              │            │
│  scenarios   │  features    │  main.py     │  React     │
│  simulator   │  train       │  billing     │  Dashboard │
│              │  detector    │  FastAPI     │  4 pages   │
│  ↓           │  ↓           │  ↓           │  ↓         │
│  Flow data   │  RF Model    │  REST + WS   │  Live UI   │
└──────────────┴──────────────┴──────────────┴────────────┘
         ↑ CSV             ↑ .joblib     ↑ JSON/WS
```

**Data flow:** Simulator generates realistic flow readings → Feature engineering extracts 11 ML features → Random Forest classifies each reading → FastAPI serves results via REST + WebSocket → React dashboard visualises everything live.

---

## 📁 Repository Structure

```
majismart/
├── README.md
├── simulator/
│   ├── simulator.py        # 4-mode data generator (batch/live/replay/demo)
│   ├── scenarios.py        # 6 flow pattern generators
│   └── data/
│       ├── training_data.csv          # 20,160 labelled readings (7 days)
│       └── training_data_sample.json  # First 200 rows for inspection
│
├── ai-engine/
│   ├── features.py         # Feature engineering (11 features)
│   ├── train.py            # Random Forest training + evaluation
│   ├── detector.py         # Real-time inference + explainability
│   └── models/
│       ├── majismart_model.joblib  # Trained model
│       └── model_report.json      # Accuracy metrics + feature importances
│
├── backend/
│   ├── main.py             # FastAPI app (REST + WebSocket)
│   ├── billing.py          # NWSC tiered tariff billing engine
│   └── requirements.txt
│
└── frontend/
    └── majismart-dashboard.jsx   # React dashboard (4 pages, live data)
```

---

## 🚀 Quick Start

### 1. Generate Training Data

```bash
cd simulator
python simulator.py --mode batch --days 7
# → data/training_data.csv  (20,160 labelled readings)
```

### 2. Train the AI Model

```bash
cd ai-engine
python train.py --data ../simulator/data/training_data.csv
# → models/majismart_model.joblib
# → Accuracy: 100% | F1: 100% | ROC-AUC: 1.0
```

### 3. Run the Detector (verify it works)

```bash
python detector.py --mode explain
# Shows detailed reasoning for each scenario type

python detector.py --mode stream --scenario leak
# Live stream of leak detection with confidence scores
```

### 4. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# API docs: http://localhost:8000/docs
# WebSocket: ws://localhost:8000/ws/live
```

### 5. Open the Dashboard

Load `frontend/majismart-dashboard.jsx` in a React environment (Vite or CodeSandbox). The dashboard connects to `ws://localhost:8000/ws/live` automatically.

---

## 🧠 How the AI Works

The detector uses a **Random Forest Classifier** trained on 11 features:

| Feature | Why it matters |
|---------|---------------|
| `rolling_variance` | **#1 leak signal** — leaks are unnaturally stable (σ²<0.05) |
| `near_zero_count` | Healthy pipes go to zero between uses; leaks never do |
| `sustained_ticks` | Leaks persist for hours; usage events are short bursts |
| `flow_lpm` | Raw flow rate |
| `rolling_mean` | Baseline comparison |
| `hour_sin/cos` | Cyclical time encoding — 11PM and 1AM are "close" |
| `is_night` | 1AM–6AM flag — when leaks are most diagnostic |
| `is_scheduled` | Farmer Mode — suppresses alerts for planned high use |
| `flow_vs_mean_ratio` | Spike detection |
| `variance_class` | Ordinal encoding of variance bands |

**The key insight:** A leak's flow variance is **unnaturally low**. A person using water creates spikes; a leaking pipe creates a flat, constant signal that never hits zero — even at 3AM.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check + uptime |
| GET | `/api/status` | Latest reading + alert state |
| GET | `/api/history?limit=288` | Recent readings (default: last 2.4h) |
| GET | `/api/billing` | Predictive bill + saving tips |
| GET | `/api/community` | Block-level usage leaderboard |
| POST | `/api/scenario` | Switch simulation scenario (demo) |
| GET | `/api/schedules` | List Farmer Mode schedules |
| POST | `/api/schedules` | Create new schedule |
| PATCH | `/api/schedules/{id}/toggle` | Toggle schedule on/off |
| DELETE | `/api/schedules/{id}` | Delete schedule |
| WS | `/ws/live` | Real-time readings stream (2s interval) |

---

## 🎬 Demo Scenarios

Switch scenarios live during the presentation via the dashboard or API:

```bash
# Trigger a leak alert
curl -X POST http://localhost:8000/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario": "leak"}'

# Show Farmer Mode suppression
curl -X POST http://localhost:8000/api/scenario \
  -d '{"scenario": "irrigation"}'

# Critical burst pipe
curl -X POST http://localhost:8000/api/scenario \
  -d '{"scenario": "burst_pipe"}'
```

---

## 📊 Model Performance

```
Accuracy            : 100.00%
Precision (Anomaly) : 100.00%
Recall (Anomaly)    : 100.00%
F1 Score            : 100.00%
ROC-AUC             : 1.0000
CV F1 (5-fold)      : 100.00% ± 0.00%
False Positive Rate :   0.00%
False Negative Rate :   0.00%

Inference speed     : 6,937 readings/second (batch)
                      ~58ms per single reading
```

**Top feature importances:**
1. `is_night` (21.8%) — time context is the strongest predictor
2. `near_zero_count` (15.7%) — leaks never hit zero
3. `flow_lpm` (14.8%) — raw signal matters
4. `hour_sin` (12.4%) — cyclical time
5. `rolling_variance` (11.0%) — the leak's main signature

---

## 💡 Simulator Modes

```bash
# Generate labelled CSV for training
python simulator.py --mode batch --days 14

# Live sensor stream (Ctrl+C to stop)
python simulator.py --mode live --scenario leak

# Fast-forward annotated 24-hour replay
python simulator.py --mode replay

# Full demo cycling all scenarios with alert bars
python simulator.py --mode demo
```

---

## 🌍 Impact

- **SDG 6** — Clean Water & Sanitation: Early leak detection prevents the ~40% water loss common in Kenyan distribution systems
- **SDG 11** — Sustainable Cities: Campus-scale and city-scale deployment path
- **Financial inclusion**: Predictive billing gives low-income households visibility before a surprise bill arrives
- **Scalable**: From USIU-Africa campus → city utility integration → national rollout

---

## 👥 Team

Built at the **USIU-Africa 72-Hour Innovation Hackathon**, March 12–14, 2026.

**Contact:** i2c@usiu.ac.ke | ajeremoki@usiu.ac.ke | cadede@usiu.ac.ke

---

*"Every litre counts."*
