"""
detector.py — MajiSmart Real-Time Anomaly Detector
====================================================
Loads the trained model and classifies incoming sensor readings.
Can run in:
  - single()   : classify one reading, return structured result
  - stream()   : classify a stream of readings from the simulator
  - explain()  : show why a reading was flagged (feature attribution)

This is the module the FastAPI backend will import and call.

Usage:
  python detector.py --mode stream --scenario leak
  python detector.py --mode explain
  python detector.py --mode benchmark
"""

import argparse
import json
import sys
import os
import time
from pathlib import Path

import joblib

# Add simulator to path so we can import scenarios
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "simulator"))
from scenarios import get_scenario, SCENARIOS
from features import (
    FEATURE_COLS,
    build_feature_vector,
    feature_vector_to_list,
    variance_class,
)

# Rolling window (lightweight — no pandas needed at inference time)
from collections import deque
import math
import random


# ── Model loader ──────────────────────────────────────────────────────────

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "majismart_model.joblib")

_model_cache = None

def load_model(path: str = DEFAULT_MODEL_PATH):
    global _model_cache
    if _model_cache is None:
        if not Path(path).exists():
            raise FileNotFoundError(
                f"Model not found at {path}.\n"
                f"Run: python train.py  to train the model first."
            )
        _model_cache = joblib.load(path)
    return _model_cache


# ── Live rolling window ───────────────────────────────────────────────────

class LiveWindow:
    """Lightweight rolling stats window for real-time inference."""
    def __init__(self, size: int = 20):
        self.buf = deque(maxlen=size)
        self._scenario = None
        self.ticks = 0

    def push(self, flow: float, scenario: str = "unknown"):
        self.buf.append(flow)
        if scenario == self._scenario:
            self.ticks += 1
        else:
            self.ticks = 1
            self._scenario = scenario

    @property
    def mean(self) -> float:
        return sum(self.buf) / len(self.buf) if self.buf else 0.0

    @property
    def variance(self) -> float:
        if len(self.buf) < 2:
            return 0.0
        m = self.mean
        return sum((x - m) ** 2 for x in self.buf) / len(self.buf)

    @property
    def near_zero_count(self) -> int:
        return sum(1 for v in self.buf if v < 0.1)


# ── Core classify function ────────────────────────────────────────────────

def classify(
    flow_lpm: float,
    hour: int,
    window: LiveWindow,
    is_scheduled: bool = False,
    model=None,
    threshold: float = 0.45,
) -> dict:
    """
    Classify a single reading.

    Returns a structured result dict with:
      - prediction     : "ANOMALY" | "NORMAL"
      - confidence     : 0.0–1.0
      - alert_type     : string label
      - features       : the feature vector used
      - explanation    : human-readable reasoning
    """
    if model is None:
        model = load_model()

    fv = build_feature_vector(
        flow_lpm         = flow_lpm,
        rolling_mean     = window.mean,
        rolling_variance = window.variance,
        near_zero_count  = window.near_zero_count,
        sustained_ticks  = window.ticks,
        hour             = hour,
        is_scheduled     = is_scheduled,
    )

    X = [feature_vector_to_list(fv)]
    proba = model.predict_proba(X)[0]
    anomaly_confidence = round(float(proba[1]), 4)
    is_anomaly = anomaly_confidence >= threshold

    # Determine alert type
    alert_type = "NONE"
    if is_anomaly and not is_scheduled:
        if flow_lpm > 55:
            alert_type = "CRITICAL_BURST"
        elif flow_lpm > 20 and (hour < 5 or hour > 22):
            alert_type = "UNSCHEDULED_HIGH_FLOW"
        else:
            alert_type = "LEAK_DETECTED"

    # Build human-readable explanation
    explanation = _explain(fv, flow_lpm, hour, is_scheduled, alert_type, anomaly_confidence)

    return {
        "prediction":     "ANOMALY" if is_anomaly else "NORMAL",
        "alert_type":     alert_type,
        "confidence":     anomaly_confidence,
        "is_anomaly":     is_anomaly,
        "is_scheduled":   is_scheduled,
        "features":       fv,
        "explanation":    explanation,
    }


def _explain(fv, flow_lpm, hour, is_scheduled, alert_type, confidence) -> dict:
    """
    Simple feature attribution — highlights the top signals
    that pushed the model toward its decision.
    """
    signals = []

    if fv["rolling_variance"] < 0.05 and flow_lpm > 0.3:
        signals.append({
            "signal": "low_variance",
            "detail": f"Flow variance σ²={fv['rolling_variance']:.5f} is unnaturally stable — consistent with a leak, not usage.",
            "severity": "high",
        })

    if fv["near_zero_count"] == 0 and len(signals) > 0:
        signals.append({
            "signal": "never_zero",
            "detail": f"Flow has not dropped to zero in the last 20 readings — healthy pipes go quiet between uses.",
            "severity": "high",
        })

    if fv["sustained_ticks"] > 15 and 0.5 < flow_lpm < 3.0:
        signals.append({
            "signal": "long_duration",
            "detail": f"Low flow has persisted for {fv['sustained_ticks']} ticks — usage events are short; leaks are continuous.",
            "severity": "medium",
        })

    if fv["is_night"] and flow_lpm > 0.5:
        signals.append({
            "signal": "night_activity",
            "detail": f"Flow detected at {hour:02d}:00 — outside expected usage hours (1AM–6AM window).",
            "severity": "medium",
        })

    if flow_lpm > 55:
        signals.append({
            "signal": "extreme_flow",
            "detail": f"Flow of {flow_lpm:.1f} L/min far exceeds normal bounds — possible burst pipe or major failure.",
            "severity": "critical",
        })

    if is_scheduled:
        signals = [{
            "signal": "farmer_mode",
            "detail": "High flow detected but matches a scheduled event — alert suppressed.",
            "severity": "info",
        }]

    return {
        "top_signals":  signals[:3],
        "confidence":   f"{confidence*100:.1f}%",
        "summary": (
            f"{'⚠ ANOMALY' if confidence >= 0.45 else '✓ Normal'}: "
            f"{signals[0]['detail'] if signals else 'No unusual patterns detected.'}"
        ),
    }


# ── Stream mode ───────────────────────────────────────────────────────────

def run_stream(scenario_name: str = "leak", interval: float = 1.0, farmer_hours: list = None):
    """Classify a live stream of simulated readings."""
    farmer_hours = farmer_hours or []
    model = load_model()
    window = LiveWindow(size=20)
    fn = get_scenario(scenario_name)

    print(f"\n🔍  MajiSmart Detector — Live Stream")
    print(f"    Scenario: {scenario_name.upper()}  |  Press Ctrl+C to stop\n")
    print(f"  {'TIME':<8} {'FLOW':>8}  {'CONF':>7}  {'RESULT':<12}  EXPLANATION")
    print(f"  {'-'*70}")

    hour = 3  # start at 3AM for leak drama
    t = 0.0

    try:
        while True:
            raw = fn(t)
            flow = raw["flow_lpm"]
            is_scheduled = hour in farmer_hours

            window.push(flow, scenario_name)
            result = classify(flow, hour, window, is_scheduled, model)

            status_icon = "🔴" if result["is_anomaly"] else "🟢"
            conf_str = f"{result['confidence']*100:.0f}%"
            alert_str = result["alert_type"] if result["is_anomaly"] else "—"
            top_signal = result["explanation"]["top_signals"][0]["signal"] if result["explanation"]["top_signals"] else "none"

            print(
                f"  {hour:02d}:{(t%60):.0f}m  "
                f"{flow:>6.3f} L/m  "
                f"{conf_str:>6}  "
                f"{status_icon} {alert_str:<14}  "
                f"↳ {top_signal}"
            )

            t += interval
            hour = (hour + 1) % 24 if t % 3600 < interval else hour
            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n\n⏹  Stream stopped.")


# ── Explain mode ──────────────────────────────────────────────────────────

def run_explain():
    """Show detailed explanation for each scenario type."""
    model = load_model()

    test_cases = [
        {"name": "Normal shower (7AM)",   "flow": 9.2,  "hour": 7,  "var": 3.1,   "ticks": 4,   "nz": 2,  "sched": False},
        {"name": "Pipe leak (3AM)",        "flow": 1.44, "hour": 3,  "var": 0.003, "ticks": 25,  "nz": 0,  "sched": False},
        {"name": "Irrigation scheduled",   "flow": 43.0, "hour": 6,  "var": 18.0,  "ticks": 12,  "nz": 0,  "sched": True},
        {"name": "Irrigation unscheduled", "flow": 43.0, "hour": 2,  "var": 18.0,  "ticks": 12,  "nz": 0,  "sched": False},
        {"name": "Burst pipe (11PM)",      "flow": 71.0, "hour": 23, "var": 42.0,  "ticks": 3,   "nz": 0,  "sched": False},
        {"name": "Idle night",             "flow": 0.02, "hour": 2,  "var": 0.0,   "ticks": 100, "nz": 20, "sched": False},
    ]

    print("\n🔬  MajiSmart — Detection Explanations")
    print("=" * 70)

    for tc in test_cases:
        window = LiveWindow(size=20)
        # Seed window with representative values
        for _ in range(20):
            window.buf.append(tc["flow"] + random.gauss(0, math.sqrt(tc["var"]) * 0.3))
        window.ticks = tc["ticks"]

        result = classify(tc["flow"], tc["hour"], window, tc["sched"], model)
        exp = result["explanation"]

        print(f"\n  📍 {tc['name']}")
        print(f"     Flow: {tc['flow']} L/min  |  Variance: {tc['var']}  |  Scheduled: {tc['sched']}")
        print(f"     Result    : {result['prediction']}  ({result['alert_type']})")
        print(f"     Confidence: {result['confidence']*100:.1f}%")
        print(f"     Summary   : {exp['summary']}")
        if exp["top_signals"]:
            for s in exp["top_signals"]:
                print(f"       [{s['severity'].upper():8}] {s['signal']}: {s['detail'][:80]}")


# ── Benchmark mode ────────────────────────────────────────────────────────

def run_benchmark(n: int = 500):
    """Speed test — how many readings/sec can the detector handle?"""
    model = load_model()
    window = LiveWindow(size=20)

    print(f"\n⚡  Benchmarking detector on {n} readings...")

    readings = []
    for _ in range(n):
        flow = random.gauss(5, 8)
        window.push(abs(flow))
        readings.append((abs(flow), random.randint(0, 23), window))

    t0 = time.time()
    for flow, hour, w in readings:
        classify(flow, hour, w, False, model)
    elapsed = time.time() - t0

    rps = n / elapsed
    print(f"   {n} readings in {elapsed*1000:.1f}ms")
    print(f"   Throughput: {rps:,.0f} readings/second")
    print(f"   Latency:    {elapsed/n*1000:.3f}ms per reading")
    print(f"\n   ✅  {'Fast enough for real-time use' if rps > 100 else 'May need optimization'}")


# ── CLI ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MajiSmart Real-Time Detector")
    parser.add_argument("--mode", choices=["stream", "explain", "benchmark"], default="explain")
    parser.add_argument("--scenario", choices=list(SCENARIOS.keys()), default="leak")
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--model", default=DEFAULT_MODEL_PATH)
    args = parser.parse_args()

    if args.model != DEFAULT_MODEL_PATH:
        global _model_cache
        _model_cache = None

    if args.mode == "stream":
        run_stream(args.scenario, args.interval)
    elif args.mode == "explain":
        run_explain()
    elif args.mode == "benchmark":
        run_benchmark()


if __name__ == "__main__":
    main()
