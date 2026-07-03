"""SVM classifier wrapper for the GastroVision API.

Pipeline (matches the architecture stated in the thesis title
"DeepLabV3+ kết hợp thuật toán SVM"):

    Endoscopy image
        -> preprocess (resize 224, ImageNet normalize)
        -> ResNet50 ImageNet backbone (fc -> Identity, frozen)
        -> 2048-D feature vector
        -> StandardScaler
        -> sklearn SVC (RBF, probability=True)
        -> {predicted_label, predicted_score, scores[27]}
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
from PIL import Image
from torchvision import models

logger = logging.getLogger(__name__)

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
DEFAULT_BACKBONE_WEIGHTS = "DEFAULT"
IMAGE_SIZE = 224
FEATURE_DIM = 2048


class SvmClassifier:
    """Loads a ResNet50 backbone + trained sklearn SVC for inference."""

    def __init__(
        self,
        model_path: Path | str,
        scaler_path: Path | str,
        backbone_weights: str = DEFAULT_BACKBONE_WEIGHTS,
        device: torch.device | None = None,
    ) -> None:
        self.model_path = Path(model_path)
        self.scaler_path = Path(scaler_path)
        self.backbone_weights_name = backbone_weights

        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.backbone = self._build_backbone(backbone_weights).to(self.device)
        self.backbone.eval()

        if not self.model_path.exists():
            raise FileNotFoundError(f"Missing SVM model: {self.model_path}")
        if not self.scaler_path.exists():
            raise FileNotFoundError(f"Missing StandardScaler: {self.scaler_path}")

        self.svm = joblib.load(self.model_path)
        self.scaler = joblib.load(self.scaler_path)

        classes = getattr(self.svm, "classes_", None)
        if classes is None:
            raise RuntimeError("Loaded SVM has no classes_; was it fitted?")
        logger.info(
            "SVM loaded: %d classes, %s device, backbone=%s",
            len(classes),
            self.device,
            backbone_weights,
        )

    @staticmethod
    def _build_backbone(weights_name: str) -> torch.nn.Module:
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
        return backbone

    def preprocess(self, image: Image.Image) -> torch.Tensor:
        """Match the training-time eval transform exactly (no augmentation)."""
        img = image.convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE))
        arr = np.asarray(img).astype(np.float32) / 255.0
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(self.device)
        return tensor

    @torch.no_grad()
    def extract_features(self, image: Image.Image) -> np.ndarray:
        tensor = self.preprocess(image)
        features = self.backbone(tensor)
        return features.cpu().numpy().reshape(-1)

    def predict(self, image: Image.Image, labels: list[str]) -> dict[str, Any]:
        """Run inference. ``labels`` must follow the order used by train_svm_classifier.

        Returns a dict with:
            predicted_label: str
            predicted_score: float  (max softmax-style probability)
            scores: dict[str, float]  (label -> probability, sum = 1.0)
        """
        if len(labels) != len(self.svm.classes_):
            raise ValueError(
                f"Label count mismatch: labels={len(labels)} vs SVM classes={len(self.svm.classes_)}. "
                "Make sure labels.json matches the one used during training."
            )

        features = self.extract_features(image)
        scaled = self.scaler.transform([features])
        probabilities = self.svm.predict_proba(scaled)[0]

        scores = {
            labels[int(cls_index)]: float(probabilities[position])
            for position, cls_index in enumerate(self.svm.classes_)
        }
        predicted_label = max(scores, key=scores.get)
        return {
            "predicted_label": predicted_label,
            "predicted_score": scores[predicted_label],
            "scores": scores,
        }