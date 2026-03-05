"""
train.py — MajiSmart AI Model Training
=======================================
Trains a Random Forest classifier on the simulator's CSV output.
Evaluates performance and saves the model for use by detector.py.

Usage:
  python train.py
  python train.py --data ../simulator/data/training_data.csv
  python train.py --data ../simulator/data/training_data.csv --trees 200

Outputs:
  models/majismart_model.joblib   — trained model
  models/model_report.json        — accuracy, feature importance, etc.
"""

import argparse
import csv
import json
import os
import time
from pathlib import Path
from collections import Counter

# scikit-learn
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    f1_score,
)
import joblib

from features import (
    FEATURE_COLS,
    TARGET_COL,
    row_to_feature_vector,
    feature_vector_to_list,
)


# ── Data loading ──────────────────────────────────────────────────────────

def load_dataset(csv_path: str):
    """Load CSV → X (feature matrix), y (labels), scenario names."""
    print(f"\n📂  Loading dataset: {csv_path}")

    X, y, scenarios = [], [], []

    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fv = row_to_feature_vector(row)
            X.append(feature_vector_to_list(fv))
            y.append(int(row[TARGET_COL] in ("True", "1", True, 1)))
            scenarios.append(row["scenario"])

    label_counts = Counter(y)
    scenario_counts = Counter(scenarios)

    print(f"   Total samples  : {len(X):,}")
    print(f"   Normal (0)     : {label_counts[0]:,}")
    print(f"   Anomaly (1)    : {label_counts[1]:,}")
    print(f"   Class balance  : {label_counts[1]/len(y)*100:.1f}% anomaly")
    print(f"\n   Scenario breakdown:")
    for s, c in sorted(scenario_counts.items(), key=lambda x: -x[1]):
        print(f"     {s:<18}: {c:,}")

    return X, y


# ── Training ───────────────────────────────────────────────────────────────

def train_model(X, y, n_estimators: int = 100, test_size: float = 0.2):
    """
    Train a Random Forest classifier.

    Why Random Forest?
    - Handles mixed feature types (ratios, counts, flags) without scaling
    - Naturally resistant to outliers
    - Gives feature importance scores (great for judge demo)
    - Fast to train and infer — runs on cheap hardware
    - No hyperparameter tuning needed to get good baseline results
    """
    print(f"\n🌲  Training Random Forest ({n_estimators} trees)...")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )

    print(f"   Train set: {len(X_train):,}  |  Test set: {len(X_test):,}")

    model = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=12,
        min_samples_leaf=5,
        class_weight="balanced",   # handles class imbalance automatically
        random_state=42,
        n_jobs=-1,                 # use all CPU cores
    )

    t0 = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - t0
    print(f"   Training time  : {train_time:.2f}s")

    return model, X_train, X_test, y_train, y_test


# ── Evaluation ────────────────────────────────────────────────────────────

def evaluate_model(model, X_train, X_test, y_train, y_test):
    """Full evaluation suite."""
    print("\n📊  Evaluating model...\n")

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    # Core metrics
    report = classification_report(y_test, y_pred, target_names=["Normal", "Anomaly"], output_dict=True)
    cm = confusion_matrix(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)
    f1 = f1_score(y_test, y_pred)

    # Cross-validation (5-fold) on training set
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring="f1", n_jobs=-1)

    # Feature importances
    importances = sorted(
        zip(FEATURE_COLS, model.feature_importances_),
        key=lambda x: -x[1]
    )

    # Pretty print
    print(f"  {'Metric':<25} {'Value':>10}")
    print(f"  {'-'*36}")
    print(f"  {'Accuracy':<25} {report['accuracy']*100:>9.2f}%")
    print(f"  {'Precision (Anomaly)':<25} {report['Anomaly']['precision']*100:>9.2f}%")
    print(f"  {'Recall (Anomaly)':<25} {report['Anomaly']['recall']*100:>9.2f}%")
    print(f"  {'F1 Score':<25} {f1*100:>9.2f}%")
    print(f"  {'ROC-AUC':<25} {auc:>10.4f}")
    print(f"  {'CV F1 Mean ± Std':<25} {cv_scores.mean()*100:>6.2f}% ± {cv_scores.std()*100:.2f}%")

    print(f"\n  Confusion Matrix:")
    print(f"                 Predicted")
    print(f"                 Normal  Anomaly")
    print(f"  Actual Normal  {cm[0][0]:>6}   {cm[0][1]:>6}")
    print(f"  Actual Anomaly {cm[1][0]:>6}   {cm[1][1]:>6}")

    tn, fp, fn, tp = cm.ravel()
    false_positive_rate = fp / (fp + tn) * 100
    print(f"\n  False Positive Rate : {false_positive_rate:.2f}%  (false leak alerts)")
    print(f"  False Negative Rate : {fn/(fn+tp)*100:.2f}%  (missed leaks)")

    print(f"\n  🔑  Feature Importances:")
    for feat, imp in importances:
        bar = "█" * int(imp * 60)
        print(f"    {feat:<22} {imp:.4f}  {bar}")

    return {
        "accuracy":             round(report["accuracy"], 4),
        "precision_anomaly":    round(report["Anomaly"]["precision"], 4),
        "recall_anomaly":       round(report["Anomaly"]["recall"], 4),
        "f1_score":             round(f1, 4),
        "roc_auc":              round(auc, 4),
        "cv_f1_mean":           round(cv_scores.mean(), 4),
        "cv_f1_std":            round(cv_scores.std(), 4),
        "false_positive_rate":  round(false_positive_rate, 4),
        "false_negative_rate":  round(fn / (fn + tp) * 100, 4),
        "confusion_matrix":     cm.tolist(),
        "feature_importances":  {f: round(float(i), 6) for f, i in importances},
    }


# ── Save ──────────────────────────────────────────────────────────────────

def save_model(model, metrics: dict, output_dir: str = "models"):
    Path(output_dir).mkdir(exist_ok=True)

    model_path = os.path.join(output_dir, "majismart_model.joblib")
    report_path = os.path.join(output_dir, "model_report.json")

    joblib.dump(model, model_path)

    report = {
        "model_type": "RandomForestClassifier",
        "feature_cols": FEATURE_COLS,
        "target_col": TARGET_COL,
        "metrics": metrics,
    }
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n✅  Model saved:")
    print(f"   📁  {model_path}")
    print(f"   📁  {report_path}")

    return model_path, report_path


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train MajiSmart anomaly detector")
    parser.add_argument("--data", default="../simulator/data/training_data.csv")
    parser.add_argument("--trees", type=int, default=100)
    parser.add_argument("--output", default="models")
    args = parser.parse_args()

    print("\n🚰  MajiSmart — AI Model Training")
    print("=" * 50)

    X, y = load_dataset(args.data)
    model, X_train, X_test, y_train, y_test = train_model(X, y, n_estimators=args.trees)
    metrics = evaluate_model(model, X_train, X_test, y_train, y_test)
    save_model(model, metrics, output_dir=args.output)

    print("\n🎯  Training complete. Run detector.py to classify live readings.\n")


if __name__ == "__main__":
    main()
