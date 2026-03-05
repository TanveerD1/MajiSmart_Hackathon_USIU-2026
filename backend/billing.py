"""
billing.py — MajiSmart Predictive Billing Engine
==================================================
Estimates end-of-month water bill in KES based on:
  - Actual usage so far this month (from HISTORY)
  - Projected remaining usage (daily pattern extrapolation)
  - Leak-adjusted scenario (what the bill WOULD be if leak is fixed)

Nairobi Water & Sewerage Company (NWSC) tiered tariff (2024):
  0–6 m³/month    → KES 103/m³
  6–20 m³/month   → KES 115/m³
  20–50 m³/month  → KES 140/m³
  50+ m³/month    → KES 165/m³

1 m³ = 1,000 litres
"""

from datetime import datetime
from typing import List


# ── Tariff ────────────────────────────────────────────────────────────────

TARIFF_KES_PER_LITRE = 0.115   # approx midpoint for residential use

TARIFF_TIERS = [
    (6_000,  0.103),   # 0–6 m³
    (20_000, 0.115),   # 6–20 m³
    (50_000, 0.140),   # 20–50 m³
    (float("inf"), 0.165),  # 50m³+
]

SEWERAGE_MULTIPLIER = 0.50     # sewerage charge = 50% of water bill
FIXED_CHARGE_KES    = 200      # monthly standing charge


def tiered_bill(litres: float) -> float:
    """Calculate water charge using NWSC tiered tariff."""
    charge = 0.0
    prev_threshold = 0.0

    for threshold, rate in TARIFF_TIERS:
        if litres <= 0:
            break
        band = min(litres, threshold - prev_threshold)
        charge += band * rate
        litres -= band
        prev_threshold = threshold

    return round(charge, 2)


def total_bill(litres: float) -> dict:
    water = tiered_bill(litres)
    sewerage = round(water * SEWERAGE_MULTIPLIER, 2)
    total = round(water + sewerage + FIXED_CHARGE_KES, 2)
    return {
        "water_charge":    water,
        "sewerage_charge": sewerage,
        "fixed_charge":    FIXED_CHARGE_KES,
        "total_kes":       total,
    }


# ── Core estimator ────────────────────────────────────────────────────────

def compute_bill_estimate(history: list) -> dict:
    """
    Given a list of reading dicts, project the end-of-month bill.

    Steps:
      1. Sum actual litres used so far
      2. Calculate daily average
      3. Project to end of month
      4. Calculate leak-free alternative
      5. Return full breakdown with saving tips
    """
    now = datetime.now()
    day_of_month = now.day
    days_in_month = 30  # approximation

    if not history:
        return {"error": "No history available"}

    # Each reading covers ~30 seconds of flow at flow_lpm litres per minute
    # litres = flow_lpm × (interval_seconds / 60)
    INTERVAL_SECONDS = 30
    actual_litres = sum(r["flow_lpm"] * (INTERVAL_SECONDS / 60) for r in history)

    # How many days of data do we actually have?
    try:
        oldest = datetime.fromisoformat(history[0]["timestamp"])
        newest = datetime.fromisoformat(history[-1]["timestamp"])
        data_days = max((newest - oldest).total_seconds() / 86400, 0.1)
    except Exception:
        data_days = 1.0

    daily_avg_litres = actual_litres / data_days
    days_remaining = max(days_in_month - day_of_month, 0)
    projected_remaining = daily_avg_litres * days_remaining
    projected_total = actual_litres + projected_remaining

    # Leak contribution
    leak_readings = [r for r in history if r.get("is_anomaly")]
    leak_litres = sum(r["flow_lpm"] * (INTERVAL_SECONDS / 60) for r in leak_readings)
    leak_daily_avg = (leak_litres / data_days) if data_days > 0 else 0
    leak_monthly_projection = leak_daily_avg * days_in_month

    # Bills
    current_bill  = total_bill(projected_total)
    leak_free_bill = total_bill(max(projected_total - leak_monthly_projection, 0))
    potential_saving = round(current_bill["total_kes"] - leak_free_bill["total_kes"], 2)

    # Saving tips
    tips = []
    if leak_monthly_projection > 500:
        tips.append({
            "action":    "Fix detected leak",
            "saving_kes": round(potential_saving * 0.7, 0),
            "saving_litres": round(leak_monthly_projection * 0.7, 0),
            "priority":  "high",
        })
    tips += [
        {"action": "Reduce shower by 2 min/day", "saving_kes": 90,  "saving_litres": 780,  "priority": "medium"},
        {"action": "Fix dripping tap",            "saving_kes": 55,  "saving_litres": 480,  "priority": "medium"},
        {"action": "Night tank shutoff valve",    "saving_kes": 60,  "saving_litres": 520,  "priority": "low"},
    ]

    return {
        "period": {
            "month":          now.strftime("%B %Y"),
            "day_of_month":   day_of_month,
            "days_remaining": days_remaining,
        },
        "usage": {
            "actual_litres":          round(actual_litres, 1),
            "daily_avg_litres":       round(daily_avg_litres, 1),
            "projected_total_litres": round(projected_total, 1),
            "leak_litres_projected":  round(leak_monthly_projection, 1),
        },
        "bill": {
            "current_projection":  current_bill,
            "leak_free_scenario":  leak_free_bill,
            "potential_saving_kes": potential_saving,
        },
        "tips": tips[:4],
        "tariff_note": "Based on NWSC tiered tariff (2024). Includes 50% sewerage surcharge + KES 200 standing charge.",
    }
