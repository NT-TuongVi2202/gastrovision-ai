"""Train an SVM classifier on features extracted from a ResNet50 ImageNet backbone.

Pipeline:
    Ảnh nội soi → ResNet50 backbone (fc → Identity) → vector 2048-D
               → StandardScaler → SVC (RBF) → 27 nhãn GastroVision

This script reuses the dataset loading and split helpers from
``train_gastrovision_classifier.py`` so that the train/val/test split stays
identical to the ResNet50 trainer (important when comparing the two approaches).

Outputs (saved to --output-dir, default ``artifacts/models/svm_classifier``):
- ``svm_model.pkl``: trained ``sklearn.svm.SVC``
- ``scaler.pkl``: fitted ``StandardScaler``
- ``labels.json``: ordered class names (same order used by ``SvmClassifier``)
- ``train_features.npy`` / ``val_features.npy`` / ``test_features.npy``: cached
  feature matrices (skip backbone re-extraction on subsequent grid searches)
- ``metrics.json``: validation/test accuracy, F1, per-class, confusion matrix
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import joblib
import numpy as np
import torch
from PIL import Image
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from torchvision import models
from torchvision import transforms

# Reuse dataset helpers so the splits match the ResNet50 trainer exactly.
from train_gastrovision_classifier import (  # type: ignore[import-not-found]
    IMAGE_EXTENSIONS,
    Sample,
    class_dirs,
    collect_from_split,
    find_split_dir,
    per_class_metrics,
    stratified_split,
)

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train SVM on ResNet50 features for GastroVision")
    parser.add_argument("--data-root", required=True, help="Path to dataset root (already split or unsplit ImageFolder)")
    parser.add_argument(
        "--output-dir",
        default="artifacts/models/svm_classifier",
        help="Where to save svm_model.pkl, scaler.pkl, labels.json, metrics.json",
    )
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size when extracting features")
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--svm-c", type=float, default=1.0)
    parser.add_argument("--svm-gamma", default="scale", help="'scale' or a float")
    parser.add_argument("--reuse-features", action="store_true", help="Skip feature extraction if .npy already exists")
    parser.add_argument(
        "--backbone-weights",
        default="DEFAULT",
        help="Torchvision weights enum name (e.g. DEFAULT, IMAGENET1K_V2). Use 'NONE' to skip ImageNet weights.",
    )
    return parser.parse_args()


def load_samples(data_root: Path, val_ratio: float, test_ratio: float, seed: int):
    """Same logic as train_gastrovision_classifier.load_samples."""
    train_dir = find_split_dir(data_root, ["train", "training"])
    val_dir = find_split_dir(data_root, ["validation", "val", "valid"])
    test_dir = find_split_dir(data_root, ["test", "testing"])

    if train_dir and val_dir:
        train_samples, labels = collect_from_split(train_dir)
        val_samples, _ = collect_from_split(val_dir, labels)
        test_samples, _ = collect_from_split(test_dir, labels) if test_dir else ([], labels)
        return train_samples, val_samples, test_samples, labels

    all_samples, labels = collect_from_split(data_root)
    if not all_samples:
        raise RuntimeError(f"No image samples found in {data_root}")
    train_samples, val_samples, test_samples = stratified_split(all_samples, val_ratio, test_ratio, seed)
    return train_samples, val_samples, test_samples, labels


def build_backbone(weights_name: str) -> torch.nn.Module:
    """Load ResNet50 with ``fc`` replaced by ``Identity`` so output is 2048-D features."""
    if weights_name.upper() == "NONE":
        backbone = models.resnet50(weights=None)
    else:
        try:
            weights_enum = getattr(models, "ResNet50_Weights")
            weight_value = getattr(weights_enum, weights_name)
        except AttributeError as exc:
            raise ValueError(
                f"Unknown ResNet50 weights name: {weights_name!r}. "
                "Use DEFAULT, IMAGENET1K_V1, IMAGENET1K_V2 or NONE."
            ) from exc
        backbone = models.resnet50(weights=weight_value)
    backbone.fc = torch.nn.Identity()
    backbone.eval()
    return backbone


def make_eval_transform(image_size: int):
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


def extract_features_for_samples(
    backbone: torch.nn.Module,
    samples: list[Sample],
    transform,
    device: torch.device,
    batch_size: int,
    feature_cache_path: Path | None = None,
    reuse_cache: bool = False,
) -> np.ndarray:
    """Extract 2048-D features for every sample. Optionally cache to .npy."""
    if reuse_cache and feature_cache_path is not None and feature_cache_path.exists():
        cache = np.load(feature_cache_path)
        if cache.shape[0] == len(samples):
            print(f"Reused cached features: {feature_cache_path} shape={cache.shape}")
            return cache
        print(f"Cached features at {feature_cache_path} have wrong shape; re-extracting.")

    features = np.zeros((len(samples), 2048), dtype=np.float32)
    backbone = backbone.to(device)

    started = time.time()
    with torch.no_grad():
        for start in range(0, len(samples), batch_size):
            batch_samples = samples[start:start + batch_size]
            tensors = torch.stack(
                [transform(Image.open(s.path).convert("RGB")) for s in batch_samples]
            ).to(device)
            outputs = backbone(tensors).cpu().numpy()
            features[start:start + len(batch_samples)] = outputs
            if (start // batch_size) % 20 == 0:
                print(f"  extracted {start + len(batch_samples)}/{len(samples)}")

    elapsed = time.time() - started
    print(f"Feature extraction took {elapsed:.1f}s for {len(samples)} samples")
    if feature_cache_path is not None:
        feature_cache_path.parent.mkdir(parents=True, exist_ok=True)
        np.save(feature_cache_path, features)
    return features


def labels_from_samples(samples: list[Sample]) -> np.ndarray:
    return np.array([s.label for s in samples], dtype=np.int64)


def _needs_calibration() -> bool:
    """sklearn >= 1.9 removed ``SVC(probability=True)``; use CalibratedClassifierCV instead."""
    import sklearn
    major, minor, *_ = sklearn.__version__.split(".")
    return (int(major), int(minor)) >= (1, 9)


def _extract_n_support(model) -> list[int] | None:
    """Return support-vector count per class for either a raw SVC or CalibratedClassifierCV[SVC]."""
    if hasattr(model, "calibrated_classifiers_"):
        cc = model.calibrated_classifiers_[0]
        base = getattr(cc, "estimator", cc)
    else:
        base = getattr(model, "estimator", model)
    n_support = getattr(base, "n_support_", None)
    if n_support is None:
        return None
    return n_support.tolist()


def save_confusion_csv(confusion: list[list[int]], labels: list[str], path: Path) -> None:
    import csv
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["true\\pred"] + labels)
        for idx, row in enumerate(confusion):
            writer.writerow([labels[idx]] + row)


def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str]) -> dict:
    n_classes = len(labels)
    confusion = np.zeros((n_classes, n_classes), dtype=np.int64)
    for true, pred in zip(y_true, y_pred):
        confusion[true, pred] += 1
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "confusion_matrix": confusion.tolist(),
        "per_class": per_class_metrics(confusion.tolist(), labels),
    }


def main() -> None:
    args = parse_args()
    data_root = Path(args.data_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    train_samples, val_samples, test_samples, labels = load_samples(
        data_root, args.val_ratio, args.test_ratio, args.seed
    )
    if len(labels) < 2:
        raise RuntimeError("Need at least 2 classes to train SVM")

    print("Classes:", labels)
    print(
        f"Samples: train={len(train_samples)}, val={len(val_samples)}, "
        f"test={len(test_samples)}"
    )

    eval_transform = make_eval_transform(args.image_size)
    backbone = build_backbone(args.backbone_weights)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Device:", device)

    train_cache = output_dir / "train_features.npy"
    val_cache = output_dir / "val_features.npy"
    test_cache = output_dir / "test_features.npy"

    X_train = extract_features_for_samples(
        backbone, train_samples, eval_transform, device, args.batch_size,
        feature_cache_path=train_cache, reuse_cache=args.reuse_features,
    )
    X_val = extract_features_for_samples(
        backbone, val_samples, eval_transform, device, args.batch_size,
        feature_cache_path=val_cache, reuse_cache=args.reuse_features,
    )
    if test_samples:
        X_test = extract_features_for_samples(
            backbone, test_samples, eval_transform, device, args.batch_size,
            feature_cache_path=test_cache, reuse_cache=args.reuse_features,
        )
    else:
        X_test = None

    y_train = labels_from_samples(train_samples)
    y_val = labels_from_samples(val_samples)
    y_test = labels_from_samples(test_samples) if test_samples else None

    scaler = StandardScaler().fit(X_train)
    X_train_scaled = scaler.transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test) if X_test is not None else None

    from sklearn.calibration import CalibratedClassifierCV

    base_svc = SVC(
        kernel="rbf",
        C=args.svm_c,
        gamma=args.svm_gamma,
        class_weight="balanced",
        random_state=args.seed,
    )
    svm = CalibratedClassifierCV(base_svc, ensemble=False) if _needs_calibration() else base_svc
    print(
        "SVM wrapper:",
        type(svm).__name__,
        "(sklearn " + __import__("sklearn").__version__ + ")",
    )
    print("Training SVM (RBF)...")
    started = time.time()
    svm.fit(X_train_scaled, y_train)
    print(f"SVM training took {time.time() - started:.1f}s")
    n_support_per_class = _extract_n_support(svm)
    if n_support_per_class is not None:
        print(f"Support vectors per class: {n_support_per_class}")

    val_pred = svm.predict(X_val_scaled)
    val_metrics = evaluate_predictions(y_val, val_pred, labels)
    print(
        f"Val accuracy={val_metrics['accuracy']:.4f} "
        f"F1_macro={val_metrics['f1_macro']:.4f}"
    )

    test_metrics = None
    if X_test_scaled is not None and y_test is not None and len(y_test) > 0:
        test_pred = svm.predict(X_test_scaled)
        test_metrics = evaluate_predictions(y_test, test_pred, labels)
        print(
            f"Test accuracy={test_metrics['accuracy']:.4f} "
            f"F1_macro={test_metrics['f1_macro']:.4f}"
        )

    joblib.dump(svm, output_dir / "svm_model.pkl")
    joblib.dump(scaler, output_dir / "scaler.pkl")
    (output_dir / "labels.json").write_text(
        json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    metrics = {
        "model": "SVC (RBF) on ResNet50 ImageNet features",
        "backbone": "ResNet50",
        "backbone_weights": args.backbone_weights,
        "feature_dim": 2048,
        "image_size": args.image_size,
        "svm_params": {"kernel": "rbf", "C": args.svm_c, "gamma": args.svm_gamma},
        "data_root": str(data_root),
        "samples": {
            "train": len(train_samples),
            "validation": len(val_samples),
            "test": len(test_samples),
        },
        "labels": labels,
        "n_support_per_class": _extract_n_support(svm),
        "validation": val_metrics,
        "test": test_metrics,
        "seed": args.seed,
    }
    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if val_metrics["confusion_matrix"]:
        save_confusion_csv(
            val_metrics["confusion_matrix"], labels, output_dir / "confusion_matrix_validation.csv"
        )
    if test_metrics and test_metrics["confusion_matrix"]:
        save_confusion_csv(
            test_metrics["confusion_matrix"], labels, output_dir / "confusion_matrix_test.csv"
        )

    print("\nSaved:")
    print(" -", output_dir / "svm_model.pkl")
    print(" -", output_dir / "scaler.pkl")
    print(" -", output_dir / "labels.json")
    print(" -", output_dir / "metrics.json")


if __name__ == "__main__":
    main()