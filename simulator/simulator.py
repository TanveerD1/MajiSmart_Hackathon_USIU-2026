"""
simulator.py — MajiSmart Water Flow Simulator
==============================================
Generates realistic water flow time-series data for:
  1. Training the AI detection model (batch CSV export)
  2. Live demo streaming (prints readings at real-time intervals)
  3. Replaying a full 24-hour day with anomalies injected

Usage:
  python simulator.py --mode batch    # generate training CSV
  python simulator.py --mode live     # stream live readings to console
  python simulator.py --mode replay   # replay a labelled 24h day
  python simulator.py --mode demo     # 60s demo with all scenarios cycling

Run `python simulator.py --help` for all options.
"""

import argparse
import json
import time
import random
import csv
import os
from datetime import datetime, timedelta
from pathlib import Path

from scenarios import (
    SCENARIOS,
    DAILY_PROFILE,
    scenario_for_hour,
    get_scenario,
)


# ── Feature engineering ────────────────────────────────────────────────────

class FeatureWindow:
    """
    Maintains a rolling window of recent readings to compute
    derived features the AI model needs:
      - rolling mean
      - rolling variance (the leak's key signature)
      - zero-cross count (how often flow hits near-zero)
      - sustained duration at current level
    """

    def __init__(self, window_size: int = 20):
        self.window_size = window_size
        self.buffer = []
        self.sustained_ticks = 0
        self._last_scenario = None

    def push(self, flow: float, scenario: str):
        self.buffer.append(flow)
        if len(self.buffer) > self.window_size:
            self.buffer.pop(0)

        if scenario == self._last_scenario:
            self.sustained_ticks += 1
        else:
            self.sustained_ticks = 1
            self._last_scenario = scenario

    def mean(self) -> float:
        if not self.buffer:
            return 0.0
        return round(sum(self.buffer) / len(self.buffer), 4)

    def variance(self) -> float:
        if len(self.buffer) < 2:
            return 0.0
        m = self.mean()
        return round(sum((x - m) ** 2 for x in self.buffer) / len(self.buffer), 6)

    def near_zero_count(self, threshold: float = 0.1) -> int:
        return sum(1 for v in self.buffer if v < threshold)

    def features(self) -> dict:
        return {
            "rolling_mean": self.mean(),
            "rolling_variance": self.variance(),
            "near_zero_count": self.near_zero_count(),
            "sustained_ticks": self.sustained_ticks,
            "buffer_size": len(self.buffer),
        }


# ── Reading builder ────────────────────────────────────────────────────────

def build_reading(
    scenario_name: str,
    t_seconds: float,
    hour: int,
    minute: int,
    window: FeatureWindow,
    is_scheduled: bool = False,
) -> dict:
    """Generate one complete sensor reading with all features."""

    fn = get_scenario(scenario_name)
    raw = fn(t_seconds)

    window.push(raw["flow_lpm"], scenario_name)
    feats = window.features()

    # Derive alert flag
    alert = False
    alert_type = None

    # Rule-based quick checks (mirrors the frontend logic)
    flow = raw["flow_lpm"]
    variance = feats["rolling_variance"]

    if not is_scheduled:
        # Leak: low constant flow at night with very low variance
        if (1 <= hour <= 6) and (0.5 < flow < 3.0) and (variance < 0.05) and feats["sustained_ticks"] > 10:
            alert = True
            alert_type = "LEAK_DETECTED"
        # Burst pipe: extreme sudden flow
        elif flow > 55.0:
            alert = True
            alert_type = "CRITICAL_BURST"
        # Unexpected high use outside normal hours
        elif flow > 20.0 and hour not in range(5, 22):
            alert = True
            alert_type = "UNSCHEDULED_HIGH_FLOW"

    return {
        # Timestamp
        "timestamp": datetime.now().isoformat(),
        "hour": hour,
        "minute": minute,
        "t_seconds": round(t_seconds, 1),

        # Raw sensor
        "flow_lpm": raw["flow_lpm"],
        "scenario": scenario_name,

        # Derived features (used by AI model)
        "rolling_mean": feats["rolling_mean"],
        "rolling_variance": feats["rolling_variance"],
        "near_zero_count": feats["near_zero_count"],
        "sustained_ticks": feats["sustained_ticks"],

        # Context
        "is_scheduled": is_scheduled,
        "hour_sin": round(__import__("math").sin(2 * 3.14159 * hour / 24), 4),
        "hour_cos": round(__import__("math").cos(2 * 3.14159 * hour / 24), 4),

        # Labels (ground truth for training)
        "alert": alert,
        "alert_type": alert_type or "NONE",
        "is_leak": scenario_name == "leak",
        "is_anomaly": scenario_name in ("leak", "burst_pipe"),
    }


# ── Modes ──────────────────────────────────────────────────────────────────

def run_batch(
    days: int = 7,
    interval_seconds: int = 30,
    farmer_mode_hours: list = None,
    output_dir: str = "data",
):
    """
    Generate `days` worth of labelled time-series data.
    Outputs:
      data/training_data.csv   — for model training
      data/training_data.json  — for inspection
    """
    farmer_mode_hours = farmer_mode_hours or [6, 7]  # default irrigation at 6–7am
    Path(output_dir).mkdir(exist_ok=True)

    readings = []
    window = FeatureWindow(window_size=20)
    total_ticks = int((days * 24 * 3600) / interval_seconds)
    t = 0.0

    print(f"\n🔄  Generating {days} day(s) of data — {total_ticks:,} readings...")

    for tick in range(total_ticks):
        hour = int((t / 3600) % 24)
        minute = int((t % 3600) / 60)
        is_scheduled = hour in farmer_mode_hours
        scenario_name = scenario_for_hour(hour, farmer_mode_hours)

        reading = build_reading(scenario_name, t, hour, minute, window, is_scheduled)
        readings.append(reading)
        t += interval_seconds

        if tick % 500 == 0:
            pct = (tick / total_ticks) * 100
            print(f"   {pct:.0f}%  [{tick:,}/{total_ticks:,}]  hour={hour:02d}  scenario={scenario_name}")

    # Save CSV
    csv_path = os.path.join(output_dir, "training_data.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=readings[0].keys())
        writer.writeheader()
        writer.writerows(readings)

    # Save JSON (first 200 rows for inspection)
    json_path = os.path.join(output_dir, "training_data_sample.json")
    with open(json_path, "w") as f:
        json.dump(readings[:200], f, indent=2)

    # Stats summary
    leaks = sum(1 for r in readings if r["is_leak"])
    anomalies = sum(1 for r in readings if r["is_anomaly"])
    alerts = sum(1 for r in readings if r["alert"])

    print(f"\n✅  Done! {len(readings):,} readings generated.")
    print(f"   📁  CSV  → {csv_path}")
    print(f"   📁  JSON → {json_path}")
    print(f"\n   📊  Label distribution:")
    print(f"       Normal readings : {len(readings) - anomalies:,}")
    print(f"       Leak readings   : {leaks:,}")
    print(f"       Anomalies total : {anomalies:,}")
    print(f"       Alerts fired    : {alerts:,}")
    print(f"\n   🔑  Key features for model:")
    print(f"       rolling_variance  ← main leak discriminator")
    print(f"       sustained_ticks   ← leak persists, usage spikes don't")
    print(f"       near_zero_count   ← leaks never hit zero")
    print(f"       hour_sin/cos      ← cyclical time encoding")

    return readings


def run_replay(farmer_mode_hours: list = None, interval: float = 0.05):
    """
    Replay a full labelled 24-hour day to the console.
    Fast-forward: each hour prints in `interval` seconds.
    """
    farmer_mode_hours = farmer_mode_hours or [6, 7]
    window = FeatureWindow(window_size=20)

    print("\n📅  24-Hour Day Replay — MajiSmart Simulator")
    print("=" * 60)
    print(f"{'TIME':<8} {'FLOW':>8} {'SCENARIO':<16} {'VARIANCE':>10} {'ALERT'}")
    print("-" * 60)

    for hour in range(24):
        is_scheduled = hour in farmer_mode_hours
        scenario_name = scenario_for_hour(hour, farmer_mode_hours)

        for minute in range(0, 60, 5):  # every 5 min
            t = hour * 3600 + minute * 60
            r = build_reading(scenario_name, t, hour, minute, window, is_scheduled)

            alert_str = f"⚠  {r['alert_type']}" if r["alert"] else "✓"
            sched_str = " [SCHED]" if is_scheduled else ""

            print(
                f"  {hour:02d}:{minute:02d}  "
                f"{r['flow_lpm']:>6.2f} L/m  "
                f"{scenario_name:<14}{sched_str:<8}  "
                f"σ²={r['rolling_variance']:<8.5f}  "
                f"{alert_str}"
            )
            time.sleep(interval)

        print()  # blank line between hours

    print("=" * 60)
    print("✅  Replay complete.\n")


def run_live(scenario_name: str = "normal_use", interval: float = 1.2, farmer_mode_hours: list = None):
    """
    Stream live readings to console — simulates a real sensor feed.
    Press Ctrl+C to stop.
    """
    farmer_mode_hours = farmer_mode_hours or []
    window = FeatureWindow(window_size=20)

    print(f"\n💧  MajiSmart Live Feed — scenario: {scenario_name}")
    print("   Press Ctrl+C to stop\n")
    print(f"{'TIME':<10} {'FLOW':>8}  {'MEAN':>8}  {'VARIANCE':>10}  STATUS")
    print("-" * 55)

    t = 0.0
    try:
        while True:
            now = datetime.now()
            hour = now.hour
            minute = now.minute
            is_scheduled = hour in farmer_mode_hours

            r = build_reading(scenario_name, t, hour, minute, window, is_scheduled)

            status = "🔴 ALERT" if r["alert"] else "🟢 OK"
            print(
                f"  {now.strftime('%H:%M:%S')}  "
                f"{r['flow_lpm']:>6.3f} L/m  "
                f"{r['rolling_mean']:>6.3f} avg  "
                f"σ²={r['rolling_variance']:<8.5f}  "
                f"{status}"
                + (f"  → {r['alert_type']}" if r["alert"] else "")
            )

            t += interval
            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n\n⏹  Live feed stopped.")


def run_demo(cycles: int = 3):
    """
    60-second demo cycling through all scenarios.
    Perfect for showing judges all detection capabilities.
    """
    demo_sequence = [
        ("idle",       8,  "Night time — household asleep"),
        ("leak",       20, "⚠  Leak signature emerging (3AM)"),
        ("idle",       5,  "Back to idle..."),
        ("normal_use", 15, "Morning routine starts"),
        ("irrigation", 12, "Farmer Mode — scheduled irrigation"),
        ("normal_use", 10, "Evening usage"),
        ("burst_pipe", 8,  "🚨 CRITICAL — burst pipe detected!"),
        ("idle",       8,  "Returning to baseline"),
    ]

    window = FeatureWindow(window_size=20)

    print("\n🎬  MajiSmart Demo Mode")
    print("=" * 65)

    t = 0.0
    hour = 3  # start at 3AM for max drama

    for scenario_name, ticks, description in demo_sequence:
        print(f"\n  ▶  {description}")
        print(f"     Scenario: {scenario_name.upper()}")
        print()

        for i in range(ticks):
            r = build_reading(scenario_name, t, hour, (i * 2) % 60, window, is_scheduled=False)

            bar_len = int(r["flow_lpm"] / 90 * 30)
            bar = "█" * bar_len + "░" * (30 - bar_len)

            alert_str = f" ← {r['alert_type']}" if r["alert"] else ""
            color_prefix = "🔴" if r["alert"] else "🟢"

            print(
                f"    {color_prefix} [{bar}]  "
                f"{r['flow_lpm']:>5.2f} L/m  "
                f"σ²={r['rolling_variance']:.5f}"
                f"{alert_str}"
            )

            t += 1.2
            hour = (hour + 1) % 24 if i % 8 == 0 else hour
            time.sleep(0.25)

    print("\n" + "=" * 65)
    print("✅  Demo complete. All scenarios demonstrated.\n")


# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="MajiSmart Water Flow Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python simulator.py --mode batch --days 14
  python simulator.py --mode live --scenario leak
  python simulator.py --mode replay
  python simulator.py --mode demo
        """
    )
    parser.add_argument(
        "--mode", choices=["batch", "live", "replay", "demo"],
        default="demo", help="Simulation mode (default: demo)"
    )
    parser.add_argument("--days", type=int, default=7, help="Days of data for batch mode")
    parser.add_argument(
        "--scenario", choices=list(SCENARIOS.keys()),
        default="normal_use", help="Scenario for live mode"
    )
    parser.add_argument("--interval", type=float, default=1.2, help="Seconds between readings")
    parser.add_argument("--output", default="data", help="Output directory for batch mode")
    parser.add_argument(
        "--farmer-hours", nargs="+", type=int, default=[6, 7],
        help="Hours when irrigation is scheduled (e.g. 6 7)"
    )

    args = parser.parse_args()

    if args.mode == "batch":
        run_batch(days=args.days, output_dir=args.output, farmer_mode_hours=args.farmer_hours)
    elif args.mode == "live":
        run_live(scenario_name=args.scenario, interval=args.interval, farmer_mode_hours=args.farmer_hours)
    elif args.mode == "replay":
        run_replay(farmer_mode_hours=args.farmer_hours)
    elif args.mode == "demo":
        run_demo()


if __name__ == "__main__":
    main()
