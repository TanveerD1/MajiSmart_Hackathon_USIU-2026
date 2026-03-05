"""
main.py — MajiSmart FastAPI Backend
=====================================
The central nervous system. Connects:
  simulator → detector → frontend (via REST + WebSocket)

Endpoints:
  GET  /                          health check
  GET  /api/status                current live reading + alert state
  GET  /api/history               last N readings
  GET  /api/billing               predictive billing summary
  GET  /api/community             anonymised block-level usage
  POST /api/schedule              add/update a Farmer Mode schedule
  GET  /api/schedules             list all schedules
  DELETE /api/schedules/{id}      remove a schedule
  WS   /ws/live                   real-time stream to dashboard

Run locally:
  pip install fastapi uvicorn
  uvicorn main:app --reload --port 8000

Then open: http://localhost:8000/docs  (auto-generated Swagger UI)
"""

import asyncio
import json
import time
import uuid
from collections import deque
from datetime import datetime, timedelta
from typing import Optional
import sys, os

# ── Path setup ────────────────────────────────────────────────────────────
# Allows importing from sibling directories
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "simulator"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-engine"))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scenarios import get_scenario, scenario_for_hour
from detector import classify, load_model, LiveWindow
from billing import compute_bill_estimate, TARIFF_KES_PER_LITRE


# ── App setup ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="MajiSmart API",
    description="AI-powered water intelligence platform — USIU-Africa Innovation Challenge 2026",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── In-memory state ───────────────────────────────────────────────────────

# Circular buffer — last 2880 readings (24h @ 30s intervals)
HISTORY: deque = deque(maxlen=2880)

# Live rolling window for the AI
LIVE_WINDOW = LiveWindow(size=20)

# Farmer Mode schedules
SCHEDULES: dict = {
    "sched-001": {
        "id": "sched-001",
        "label": "Garden Irrigation",
        "days": ["Monday", "Wednesday", "Friday"],
        "start_hour": 6,
        "end_hour": 7,
        "active": True,
    },
    "sched-002": {
        "id": "sched-002",
        "label": "Roof Tank Fill",
        "days": ["Sunday"],
        "start_hour": 8,
        "end_hour": 9,
        "active": False,
    },
}

# Active WebSocket connections
WS_CLIENTS: list = []

# Current simulated scenario (can be switched via API)
CURRENT_SCENARIO = {"name": "normal_use"}

# Boot time for uptime tracking
BOOT_TIME = time.time()


# ── Pydantic models ───────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    label: str
    days: list[str]
    start_hour: int
    end_hour: int
    active: bool = True


class ScenarioSwitch(BaseModel):
    scenario: str   # idle | normal_use | leak | irrigation | tank_fill | burst_pipe


# ── Helpers ───────────────────────────────────────────────────────────────

def is_scheduled_now(hour: int) -> bool:
    """Check if current hour falls within any active Farmer Mode schedule."""
    now_day = datetime.now().strftime("%A")
    for s in SCHEDULES.values():
        if not s["active"]:
            continue
        if now_day in s["days"] and s["start_hour"] <= hour < s["end_hour"]:
            return True
    return False


def make_reading(scenario_name: str) -> dict:
    """Generate one reading: raw sensor → AI classification → structured result."""
    now = datetime.now()
    hour = now.hour

    fn = get_scenario(scenario_name)
    raw = fn(t_seconds=time.time())

    flow = raw["flow_lpm"]
    is_scheduled = is_scheduled_now(hour)

    LIVE_WINDOW.push(flow, scenario_name)

    try:
        model = load_model()
        result = classify(flow, hour, LIVE_WINDOW, is_scheduled, model)
    except FileNotFoundError:
        # Model not trained yet — fall back to rule-based only
        result = {
            "prediction": "NORMAL",
            "alert_type": "NONE",
            "confidence": 0.0,
            "is_anomaly": False,
            "is_scheduled": is_scheduled,
            "features": {},
            "explanation": {"summary": "Model not loaded", "top_signals": []},
        }

    reading = {
        "id":           str(uuid.uuid4())[:8],
        "timestamp":    now.isoformat(),
        "hour":         hour,
        "minute":       now.minute,
        "second":       now.second,
        "flow_lpm":     round(flow, 3),
        "scenario":     scenario_name,
        "is_scheduled": is_scheduled,
        # AI output
        "prediction":   result["prediction"],
        "alert_type":   result["alert_type"],
        "confidence":   result["confidence"],
        "is_anomaly":   result["is_anomaly"],
        "explanation":  result["explanation"]["summary"],
        "top_signals":  result["explanation"]["top_signals"],
        # Rolling stats (for frontend chart)
        "rolling_mean":     round(LIVE_WINDOW.mean, 3),
        "rolling_variance": round(LIVE_WINDOW.variance, 4),
    }

    HISTORY.append(reading)
    return reading


# ── Background task: sensor loop ──────────────────────────────────────────

async def sensor_loop(interval_seconds: float = 2.0):
    """
    Runs in the background forever.
    Every `interval_seconds`:
      1. Generates a new reading
      2. Broadcasts it to all connected WebSocket clients
    """
    while True:
        scenario = CURRENT_SCENARIO["name"]
        reading = make_reading(scenario)

        # Broadcast to all live dashboard connections
        dead = []
        for ws in WS_CLIENTS:
            try:
                await ws.send_text(json.dumps(reading))
            except Exception:
                dead.append(ws)

        for ws in dead:
            WS_CLIENTS.remove(ws)

        await asyncio.sleep(interval_seconds)


@app.on_event("startup")
async def startup():
    # Pre-fill history with 1 hour of data so the dashboard isn't empty on load
    print("🚰  MajiSmart backend starting...")
    _prefill_history()
    asyncio.create_task(sensor_loop(interval_seconds=2.0))
    print("✅  Sensor loop started. Streaming every 2s.")


def _prefill_history(hours: int = 2):
    """Seed HISTORY with realistic past data so the charts look good immediately."""
    import math
    from scenarios import DAILY_PROFILE, scenario_for_hour

    now = datetime.now()
    ticks = hours * 60 * 2   # 2 readings/min × 60min × hours
    window = LiveWindow(size=20)

    for i in range(ticks):
        past_time = now - timedelta(seconds=(ticks - i) * 30)
        hour = past_time.hour
        scenario_name = scenario_for_hour(hour, farmer_mode_hours=[6, 7])

        fn = get_scenario(scenario_name)
        raw = fn(t_seconds=i * 30)
        flow = raw["flow_lpm"]
        window.push(flow, scenario_name)

        HISTORY.append({
            "id":               f"pre-{i}",
            "timestamp":        past_time.isoformat(),
            "hour":             hour,
            "minute":           past_time.minute,
            "second":           0,
            "flow_lpm":         round(flow, 3),
            "scenario":         scenario_name,
            "is_scheduled":     hour in [6, 7],
            "prediction":       "ANOMALY" if scenario_name in ("leak", "burst_pipe") else "NORMAL",
            "alert_type":       "LEAK_DETECTED" if scenario_name == "leak" else "NONE",
            "confidence":       0.83 if scenario_name == "leak" else 0.05,
            "is_anomaly":       scenario_name in ("leak", "burst_pipe"),
            "explanation":      "",
            "top_signals":      [],
            "rolling_mean":     round(window.mean, 3),
            "rolling_variance": round(window.variance, 4),
        })

    print(f"   Pre-filled {len(HISTORY)} historical readings.")


# ── REST Routes ───────────────────────────────────────────────────────────

@app.get("/")
def health():
    uptime = int(time.time() - BOOT_TIME)
    return {
        "service":  "MajiSmart API",
        "status":   "online",
        "version":  "1.0.0",
        "uptime_s": uptime,
        "readings": len(HISTORY),
        "clients":  len(WS_CLIENTS),
    }


@app.get("/api/status")
def get_status():
    """Latest reading + system status. Polled by dashboard every 5s as fallback."""
    if not HISTORY:
        return {"status": "no_data"}

    latest = HISTORY[-1]
    anomalies_24h = sum(1 for r in HISTORY if r["is_anomaly"])
    total_litres = sum(r["flow_lpm"] for r in HISTORY) * (30 / 60)  # 30s intervals → litres

    return {
        "latest":        latest,
        "scenario":      CURRENT_SCENARIO["name"],
        "anomalies_24h": anomalies_24h,
        "total_litres":  round(total_litres, 1),
        "uptime_pct":    99.8,
        "sensor_health": "online",
    }


@app.get("/api/history")
def get_history(limit: int = 288, hours: int = None):
    """
    Return recent readings.
    ?limit=288   → last 288 readings (default, ~2.4 hours at 30s)
    ?hours=24    → last 24 hours of data
    """
    data = list(HISTORY)

    if hours:
        cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
        data = [r for r in data if r["timestamp"] >= cutoff]

    return {
        "readings": data[-limit:],
        "count":    len(data[-limit:]),
        "oldest":   data[0]["timestamp"] if data else None,
        "newest":   data[-1]["timestamp"] if data else None,
    }


@app.get("/api/billing")
def get_billing():
    """Predictive billing based on current usage patterns."""
    data = list(HISTORY)
    if not data:
        return {"error": "no data"}

    bill = compute_bill_estimate(data)
    return bill


@app.get("/api/community")
def get_community():
    """
    Anonymised block-level water usage for leaderboard.
    In production this queries Firebase; here we generate realistic data.
    """
    import random
    random.seed(42)  # stable seed = same values on every call

    blocks = [
        {"id": "block-a", "name": "Block A (You)", "usage_litres": 3200,  "is_self": True},
        {"id": "block-b", "name": "Block B",        "usage_litres": 5800,  "is_self": False},
        {"id": "block-c", "name": "Block C",        "usage_litres": 4100,  "is_self": False},
        {"id": "block-d", "name": "Block D",        "usage_litres": 6900,  "is_self": False},
        {"id": "block-e", "name": "Block E",        "usage_litres": 2900,  "is_self": False},
        {"id": "block-f", "name": "Block F",        "usage_litres": 4700,  "is_self": False},
    ]

    avg = sum(b["usage_litres"] for b in blocks) / len(blocks)
    sorted_blocks = sorted(blocks, key=lambda b: b["usage_litres"])
    for i, b in enumerate(sorted_blocks):
        b["rank"] = i + 1
        b["vs_avg_pct"] = round((b["usage_litres"] - avg) / avg * 100, 1)
        b["bill_kes"] = round(b["usage_litres"] * TARIFF_KES_PER_LITRE, 0)

    you = next(b for b in sorted_blocks if b["is_self"])

    return {
        "blocks":       sorted_blocks,
        "average_litres": round(avg, 0),
        "your_rank":    you["rank"],
        "your_saving_vs_avg": round(avg - you["usage_litres"], 0),
    }


@app.post("/api/scenario")
def switch_scenario(body: ScenarioSwitch):
    """Switch the live simulation scenario (for demo)."""
    valid = ["idle", "normal_use", "leak", "irrigation", "tank_fill", "burst_pipe"]
    if body.scenario not in valid:
        raise HTTPException(400, f"Unknown scenario. Choose from: {valid}")
    CURRENT_SCENARIO["name"] = body.scenario
    return {"switched_to": body.scenario, "message": f"Now simulating: {body.scenario}"}


@app.get("/api/schedules")
def list_schedules():
    return {"schedules": list(SCHEDULES.values())}


@app.post("/api/schedules")
def create_schedule(body: ScheduleCreate):
    sid = f"sched-{str(uuid.uuid4())[:6]}"
    SCHEDULES[sid] = {"id": sid, **body.dict()}
    return {"created": SCHEDULES[sid]}


@app.patch("/api/schedules/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str):
    if schedule_id not in SCHEDULES:
        raise HTTPException(404, "Schedule not found")
    SCHEDULES[schedule_id]["active"] = not SCHEDULES[schedule_id]["active"]
    return {"updated": SCHEDULES[schedule_id]}


@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: str):
    if schedule_id not in SCHEDULES:
        raise HTTPException(404, "Schedule not found")
    deleted = SCHEDULES.pop(schedule_id)
    return {"deleted": deleted}


# ── WebSocket ─────────────────────────────────────────────────────────────

@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    """
    Real-time sensor stream.
    The React dashboard connects here and receives a new JSON reading every 2s.

    Connection flow:
      1. Client connects → server sends last 60 readings as catch-up
      2. Server pushes new reading every 2s indefinitely
      3. Client disconnects → cleaned up silently
    """
    await ws.accept()
    WS_CLIENTS.append(ws)

    # Send historical catch-up so dashboard populates immediately
    catchup = list(HISTORY)[-60:]
    await ws.send_text(json.dumps({"type": "catchup", "readings": catchup}))

    try:
        while True:
            # Keep connection alive; data is pushed by sensor_loop
            await ws.receive_text()
    except WebSocketDisconnect:
        WS_CLIENTS.remove(ws)
    except Exception:
        if ws in WS_CLIENTS:
            WS_CLIENTS.remove(ws)
