"""
features.py — MajiSmart Feature Engineering
=============================================
Transforms raw sensor readings into the feature vector
the Random Forest model expects.

Feature groups:
  1. Raw sensor      : flow_lpm
  2. Rolling stats   : mean, variance, near_zero_count, sustained_ticks
  3. Time encoding   : hour_sin, hour_cos (cyclical — midnight ≈ 6AM in distance)
  4. Context flags   : is_scheduled
  5. Derived ratios  : flow_vs_mean_ratio, variance_class
"""

import math
from typing import Optional


# ── Feature names (must match CSV columns + be stable across train/infer) ──

FEATURE_COLS = [
    "flow_lpm",
    "rolling_mean",
    "rolling_variance",
    "near_zero_count",
    "sustained_ticks",
    "hour_sin",
    "hour_cos",
    "is_scheduled",
    "flow_vs_mean_ratio",
    "is_night",
    "variance_class",
]

TARGET_COL = "is_anomaly"   # binary: leak or burst_pipe = 1, else 0
SCENARIO_COL = "scenario"   # multiclass label for diagnostics


# ── Variance classes (human-readable + ordinal encoding) ──────────────────

def variance_class(variance: float) -> int:
    """
    Encode variance into ordinal class.
    Leaks sit in class 0–1 (suspiciously stable).
    Normal use spikes into class 3–4.
    """
    if variance < 0.05:   return 0   # suspiciously_low → leak candidate
    if variance < 0.5:    return 1   # low
    if variance < 5.0:    return 2   # medium
    if variance < 50.0:   return 3   # high
    return 4                          # extreme → burst or irrigation


# ── Core feature builder ──────────────────────────────────────────────────

def build_feature_vector(
    flow_lpm: float,
    rolling_mean: float,
    rolling_variance: float,
    near_zero_count: int,
    sustained_ticks: int,
    hour: int,
    is_scheduled: bool = False,
) -> dict:
    """
    Build the complete feature dict from a raw reading.
    Used at both training time (from CSV rows) and inference time (live).
    """
    # Cyclical time encoding — preserves midnight continuity
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)

    # Ratio: current flow vs rolling average (spikes are obvious; leaks are subtle)
    if rolling_mean > 0.01:
        flow_vs_mean_ratio = flow_lpm / rolling_mean
    else:
        flow_vs_mean_ratio = 1.0

    # Night flag (1AM–6AM) — when leaks are most diagnostic
    is_night = 1 if (1 <= hour <= 6) else 0

    return {
        "flow_lpm":           round(flow_lpm, 4),
        "rolling_mean":       round(rolling_mean, 4),
        "rolling_variance":   round(rolling_variance, 6),
        "near_zero_count":    int(near_zero_count),
        "sustained_ticks":    int(sustained_ticks),
        "hour_sin":           round(hour_sin, 4),
        "hour_cos":           round(hour_cos, 4),
        "is_scheduled":       int(is_scheduled),
        "flow_vs_mean_ratio": round(flow_vs_mean_ratio, 4),
        "is_night":           is_night,
        "variance_class":     variance_class(rolling_variance),
    }


def row_to_feature_vector(row: dict) -> dict:
    """Convert a CSV row dict → feature dict. Used during training."""
    return build_feature_vector(
        flow_lpm         = float(row["flow_lpm"]),
        rolling_mean     = float(row["rolling_mean"]),
        rolling_variance = float(row["rolling_variance"]),
        near_zero_count  = int(row["near_zero_count"]),
        sustained_ticks  = int(row["sustained_ticks"]),
        hour             = int(row["hour"]),
        is_scheduled     = row["is_scheduled"] in ("True", "1", True, 1),
    )


def feature_vector_to_list(fv: dict) -> list:
    """Convert feature dict → ordered list for sklearn. Order = FEATURE_COLS."""
    return [fv[col] for col in FEATURE_COLS]
