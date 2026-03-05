"""
scenarios.py — MajiSmart Flow Scenario Definitions
====================================================
Each scenario returns a realistic flow reading (litres/min)
based on statistical models of real-world water behaviour.

Scenarios:
  - idle          : Night/no-use. Should be near zero.
  - normal_use    : Shower, tap, cooking. Spike then stops.
  - leak          : Constant low flow, unnaturally low variance. Never zero.
  - irrigation    : High burst flow, large duration, user-scheduled.
  - tank_fill     : Medium-high sustained flow. Scheduled.
  - burst_pipe    : Sudden very high flow, unscheduled — critical alert.
"""

import random
import math


# ── Helpers ────────────────────────────────────────────────────────────────

def clamp(val, lo=0.0, hi=100.0):
    return max(lo, min(hi, val))

def gauss(mean, std):
    return random.gauss(mean, std)


# ── Core scenario functions ────────────────────────────────────────────────

def idle(t_seconds: float = 0) -> dict:
    """
    No water use. Tiny sensor noise around zero.
    Variance is key: σ ≈ 0.03
    """
    flow = clamp(gauss(0.02, 0.03))
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "idle",
        "variance_signature": "very_low",
        "expected_alert": False,
    }


def normal_use(t_seconds: float = 0) -> dict:
    """
    Household tap/shower use. Short burst, high variance, drops to zero.
    Modelled as a sine-decayed pulse to simulate tap on → off.
    """
    # Simulate a 3-minute usage window within the call
    phase = (t_seconds % 180) / 180  # 0.0 → 1.0 over 3 min
    envelope = math.sin(phase * math.pi)  # rises then falls back to 0
    base_flow = 9.5 * envelope
    flow = clamp(gauss(base_flow, 1.5))
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "normal_use",
        "variance_signature": "high",
        "expected_alert": False,
    }


def leak(t_seconds: float = 0) -> dict:
    """
    Pipe/joint leak. Key signature:
      - Constant low flow (1.0–2.0 L/min)
      - Unnaturally LOW variance (σ ≈ 0.08)
      - NEVER drops to zero — this is the AI's main tell
      - Persists for hours (especially 1AM–5AM)
    """
    flow = clamp(gauss(1.45, 0.08), lo=0.9, hi=2.5)
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "leak",
        "variance_signature": "suspiciously_low",
        "expected_alert": True,
        "alert_type": "LEAK_DETECTED",
    }


def irrigation(t_seconds: float = 0) -> dict:
    """
    Garden/farm irrigation. Large volume, time-limited burst.
    Should be SUPPRESSED if user has a Farmer Mode schedule active.
    """
    flow = clamp(gauss(42.0, 4.5), lo=30.0, hi=55.0)
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "irrigation",
        "variance_signature": "high_sustained",
        "expected_alert": False,  # suppressed by Farmer Mode
        "farmer_mode_note": "Alert suppressed — scheduled irrigation event",
    }


def tank_fill(t_seconds: float = 0) -> dict:
    """
    Rooftop storage tank refilling. Medium-high sustained flow.
    Typically scheduled weekly. Duration: 45–90 min.
    """
    flow = clamp(gauss(18.0, 2.0), lo=12.0, hi=25.0)
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "tank_fill",
        "variance_signature": "medium_sustained",
        "expected_alert": False,
    }


def burst_pipe(t_seconds: float = 0) -> dict:
    """
    Critical failure — burst pipe or major rupture.
    Very high flow (60+ L/min), sudden onset, no schedule match.
    Triggers CRITICAL alert immediately.
    """
    flow = clamp(gauss(68.0, 6.0), lo=50.0, hi=90.0)
    return {
        "flow_lpm": round(flow, 3),
        "scenario": "burst_pipe",
        "variance_signature": "extreme",
        "expected_alert": True,
        "alert_type": "CRITICAL_BURST",
    }


# ── Scenario registry ──────────────────────────────────────────────────────

SCENARIOS = {
    "idle": idle,
    "normal_use": normal_use,
    "leak": leak,
    "irrigation": irrigation,
    "tank_fill": tank_fill,
    "burst_pipe": burst_pipe,
}


def get_scenario(name: str):
    """Return scenario function by name."""
    if name not in SCENARIOS:
        raise ValueError(f"Unknown scenario '{name}'. Choose from: {list(SCENARIOS.keys())}")
    return SCENARIOS[name]


# ── Realistic 24-hour day profile ──────────────────────────────────────────

# Maps hour-of-day → most likely scenario
DAILY_PROFILE = {
    0:  "idle",
    1:  "idle",
    2:  "idle",
    3:  "leak",       # leak window — when households are asleep
    4:  "leak",
    5:  "idle",
    6:  "normal_use", # morning routines
    7:  "normal_use",
    8:  "normal_use",
    9:  "idle",
    10: "idle",
    11: "normal_use",
    12: "normal_use", # lunch
    13: "idle",
    14: "idle",
    15: "idle",
    16: "idle",
    17: "normal_use", # afternoon
    18: "normal_use", # evening peak
    19: "normal_use",
    20: "normal_use",
    21: "idle",
    22: "idle",
    23: "idle",
}


def scenario_for_hour(hour: int, farmer_mode_hours: list = None) -> str:
    """
    Return the scenario name for a given hour of day.
    If farmer_mode_hours provided and hour matches, returns 'irrigation'.
    """
    farmer_mode_hours = farmer_mode_hours or []
    if hour in farmer_mode_hours:
        return "irrigation"
    return DAILY_PROFILE.get(hour % 24, "idle")
