import asyncio
import base64
import io
import json
import logging
import os
import time
import uuid
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[1]       # .../backend  (storage/, logs/)
REPO_ROOT = Path(__file__).resolve().parents[2]      # .../gastrovision-ai  (artifacts/)

# Logging: surface exceptions to disk so we can debug without re-running the request.
LOG_DIR = ROOT_DIR / "storage" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "backend.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("gastrovision")

# Simple per-IP rate limit (sliding window) for the expensive /api/analyze endpoint.
# Tuned so a single user can't saturate the GPU/CPU while still tolerating bursty use.
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "30"))
_rate_window: dict[str, deque[float]] = {}


def _check_rate_limit(ip: str) -> None:
    """Raise 429 if this IP has exceeded RATE_LIMIT_PER_MIN calls in the last 60s."""
    now = time.monotonic()
    window = _rate_window.setdefault(ip, deque())
    cutoff = now - 60.0
    while window and window[0] < cutoff:
        window.popleft()
    if len(window) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Quá nhiều yêu cầu ({RATE_LIMIT_PER_MIN}/phút). "
                "Vui lòng đợi một chút trước khi thử lại."
            ),
        )
    window.append(now)

DEFAULT_CLASSIFIER_DIR = REPO_ROOT / "artifacts" / "models" / "svm_classifier"
CLASSIFIER_DIR = Path(os.getenv("CLASSIFIER_MODEL_DIR", str(DEFAULT_CLASSIFIER_DIR)))
SVM_MODEL_PATH = Path(os.getenv("SVM_MODEL_PATH", str(CLASSIFIER_DIR / "svm_model.pkl")))
SVM_SCALER_PATH = Path(os.getenv("SVM_SCALER_PATH", str(CLASSIFIER_DIR / "scaler.pkl")))
CLASSIFIER_PATH = SVM_MODEL_PATH  # backward-compatible name in /api/health
LABELS_PATH = Path(os.getenv("CLASSIFIER_LABELS_PATH", str(CLASSIFIER_DIR / "labels.json")))
FEATURE_BACKBONE_WEIGHTS = os.getenv("FEATURE_BACKBONE_WEIGHTS", "DEFAULT")
SEGMENTATION_PATH = REPO_ROOT / "artifacts" / "models" / "segmentation" / "deeplabv3plus_polyp_final_benchmark.keras"
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "5"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))
# Raw 27-class thresholds. CONFIDENCE_RAW_THRESHOLD is the "winning" bar that,
# combined with a small CONFIDENCE_MARGIN, distinguishes a real prediction from
# noise. CONFIDENCE_RAW_FLOOR is the absolute floor below which we never trust
# the model (helps catch obvious OOD inputs like solid colors or random noise).
CONFIDENCE_RAW_FLOOR = float(os.getenv("CONFIDENCE_RAW_FLOOR", "0.45"))
INFERENCE_TIMEOUT_SECONDS = float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "30"))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(4096 * 4096)))

DEFAULT_LABELS = ["esophagitis", "normal", "polyps"]
LABEL_DISPLAY = {
    "Accessory tools": "Dụng cụ nội soi",
    "Angiectasia": "Giãn mạch niêm mạc",
    "Barrett's esophagus": "Barrett thực quản",
    "Blood in lumen": "Có máu trong lòng ống tiêu hóa",
    "Cecum": "Manh tràng",
    "Colon diverticula": "Túi thừa đại tràng",
    "Colon polyps": "Polyp đại tràng",
    "Colorectal cancer": "Ung thư đại trực tràng",
    "Duodenal bulb": "Hành tá tràng",
    "Dyed-lifted-polyps": "Polyp đã nhuộm và nâng tổn thương",
    "Dyed-resection-margins": "Rìa cắt sau nhuộm màu",
    "Erythema": "Ban đỏ niêm mạc",
    "Esophageal varices": "Giãn tĩnh mạch thực quản",
    "Esophagitis": "Viêm thực quản",
    "Gastric polyps": "Polyp dạ dày",
    "Gastroesophageal_junction_normal z-line": "Vùng nối dạ dày - thực quản bình thường",
    "Ileocecal valve": "Van hồi manh tràng",
    "Mucosal inflammation large bowel": "Viêm niêm mạc đại tràng",
    "Normal esophagus": "Thực quản bình thường",
    "Normal mucosa and vascular pattern in the large bowel": "Niêm mạc và mạch máu đại tràng bình thường",
    "Normal stomach": "Dạ dày bình thường",
    "Pylorus": "Môn vị",
    "Resected polyps": "Polyp đã cắt",
    "Resection margins": "Rìa cắt tổn thương",
    "Retroflex rectum": "Trực tràng quan sát ngược",
    "Small bowel_terminal ileum": "Ruột non - hồi tràng cuối",
    "Ulcer": "Ổ loét",
    "normal": "Bình thường",
    "esophagitis": "Viêm thực quản",
    "polyps": "Polyp",
}
MESSAGES = {
    "normal": "Không phát hiện bất thường trong phạm vi dữ liệu mô hình đã học.",
    "esophagitis": "Nghi ngờ viêm thực quản.",
    "polyps": "Phát hiện vùng lồi niêm mạc nghi ngờ polyp. Cần bác sĩ nội soi đối chiếu nhiều góc nhìn, kích thước thực tế và cân nhắc sinh thiết/cắt polyp nếu phù hợp.",
}
DISCLAIMER = "Kết quả chỉ hỗ trợ nghiên cứu, không thay thế chẩn đoán của bác sĩ."

# Defensive limits for free-text fields so an attacker can't blow up the response
# or PDF export by sending megabytes of garbage.
MAX_SYMPTOMS_LEN = 500
MAX_AGE_LEN = 5
MAX_GENDER_LEN = 20


def load_classifier_labels() -> list[str]:
    if LABELS_PATH.exists():
        with LABELS_PATH.open("r", encoding="utf-8") as file:
            labels = json.load(file)
        if isinstance(labels, list) and labels:
            return [str(label) for label in labels]
    return DEFAULT_LABELS


def display_label(label: str | None) -> str | None:
    if label is None:
        return None
    return LABEL_DISPLAY.get(label, label.replace("_", " "))


def is_polyp_label(label: str | None) -> bool:
    return bool(label and "polyp" in label.lower())


def normalize_label_key(label: str | None) -> str:
    return (label or "").strip().lower().replace("_", " ")


REPORT_LABELS = ["normal", "esophagitis", "polyps"]


def group_raw_label(label: str | None) -> str:
    key = normalize_label_key(label)
    if "polyp" in key or "resection margin" in key:
        return "polyps"
    normal_keywords = [
        "normal",
        "cecum",
        "duodenal bulb",
        "pylorus",
        "ileocecal valve",
        "retroflex rectum",
        "small bowel terminal ileum",
        "gastroesophageal junction",
    ]
    if any(keyword in key for keyword in normal_keywords):
        return "normal"
    return "esophagitis"


@dataclass
class ModelStatus:
    classifier_loaded: bool = False
    segmentation_loaded: bool = False
    classifier_error: str | None = None
    segmentation_error: str | None = None


class GastroVisionInference:
    def __init__(self) -> None:
        self.status = ModelStatus()
        self.device: Any = None
        self.labels = load_classifier_labels()
        self.classifier: Any = None
        self.segmentation_model: Any = None
        self._load_classifier()
        self._load_segmentation()

    def _load_classifier(self) -> None:
        try:
            from .ml.svm_classifier import SvmClassifier

            if not SVM_MODEL_PATH.exists():
                raise FileNotFoundError(f"Missing SVM model: {SVM_MODEL_PATH}")
            if not SVM_SCALER_PATH.exists():
                raise FileNotFoundError(f"Missing StandardScaler: {SVM_SCALER_PATH}")

            self.classifier = SvmClassifier(
                model_path=SVM_MODEL_PATH,
                scaler_path=SVM_SCALER_PATH,
                backbone_weights=FEATURE_BACKBONE_WEIGHTS,
            )
            self.device = self.classifier.device
            self.status.classifier_loaded = True
        except Exception as exc:  # pragma: no cover - reported through health endpoint
            self.status.classifier_error = str(exc)

    def _load_segmentation(self) -> None:
        try:
            if not SEGMENTATION_PATH.exists():
                raise FileNotFoundError(f"Missing segmentation model: {SEGMENTATION_PATH}")

            import tensorflow as tf
            from tensorflow import keras
            from tensorflow.keras import layers
            from tensorflow.keras.applications.resnet import preprocess_input

            @tf.keras.utils.register_keras_serializable(package="PolypSeg")
            class ResizeTo(layers.Layer):
                def __init__(self, height: int, width: int, **kwargs: Any) -> None:
                    super().__init__(**kwargs)
                    self.height = int(height)
                    self.width = int(width)

                def call(self, inputs: Any) -> Any:
                    return tf.image.resize(inputs, (self.height, self.width), method="bilinear")

                def get_config(self) -> dict[str, Any]:
                    config = super().get_config()
                    config.update({"height": self.height, "width": self.width})
                    return config

            custom_objects = {
                "ResizeTo": ResizeTo,
                "PolypSeg>ResizeTo": ResizeTo,
                "preprocess_input": preprocess_input,
            }
            self.segmentation_model = keras.models.load_model(
                SEGMENTATION_PATH,
                compile=False,
                safe_mode=False,
                custom_objects=custom_objects,
            )
            self.status.segmentation_loaded = True
        except Exception as exc:  # pragma: no cover - segmentation is optional at runtime
            self.status.segmentation_error = str(exc)

    def analyze(self, image: Image.Image, clinical_context: dict[str, str] | None = None) -> dict[str, Any]:
        if not self.status.classifier_loaded or self.classifier is None:
            raise HTTPException(
                status_code=503,
                detail=f"Classifier model is not loaded: {self.status.classifier_error}",
            )

        classification = self._classify(image)
        scores = classification["scores"]
        raw_scores = classification["raw_scores"]
        # Confidence decision: the raw 27-class top-1 is the most honest signal
        # of what the model actually believes. SVM with CalibratedClassifierCV
        # tends to saturate at ~0.55 for OOD inputs, so a generous floor still
        # catches uncertain real predictions (e.g. ambiguous polyps vs cancer).
        sorted_raw = sorted(raw_scores.values(), reverse=True)
        raw_top = sorted_raw[0] if sorted_raw else 0.0
        is_low_confidence = bool(raw_top < CONFIDENCE_RAW_FLOOR)

        predicted_label = max(scores, key=scores.get)
        predicted_score = scores[predicted_label]
        result_label = None if is_low_confidence else predicted_label
        polyp_score = float(scores.get("polyps", 0.0))
        subgroup_polyp_score = max(
            (
                float(item.get("score", 0.0))
                for item in classification["subgroup_scores"]
                if is_polyp_label(item.get("label")) or item.get("group") == "polyps"
            ),
            default=0.0,
        )
        should_segment_polyp = bool(
            self.status.segmentation_loaded
            and not is_low_confidence
            and (
                is_polyp_label(result_label)
                or polyp_score >= 0.12
                or subgroup_polyp_score >= 0.10
            )
        )
        polyp = {
            "has_polyp": should_segment_polyp,
            "mask_base64": None,
            "overlay_base64": None,
            "area_ratio": None,
        }

        if should_segment_polyp:
            polyp.update(self._segment_polyp(image))

        return {
            "label": result_label,
            "label_display": display_label(result_label),
            "message": self._message(result_label, is_low_confidence),
            "is_low_confidence": is_low_confidence,
            "confidence": {
                "predicted_label": predicted_label,
                "predicted_score": predicted_score,
                "scores": scores,
                "raw_scores": classification["raw_scores"],
                "subgroup_scores": classification["subgroup_scores"],
            },
            "polyp": polyp,
            "clinical_assessment": add_clinical_context_to_assessment(
                self._clinical_assessment(result_label, is_low_confidence, predicted_score, polyp),
                clinical_context,
            ),
            "disclaimer": DISCLAIMER,
        }

    def _classify(self, image: Image.Image) -> dict[str, float]:
        result = self.classifier.predict(image, self.labels)
        raw_scores = result["scores"]

        grouped_scores = {label: 0.0 for label in REPORT_LABELS}
        for label, score in raw_scores.items():
            grouped_scores[group_raw_label(label)] += score

        subgroup_scores = [
            {
                "label": label,
                "label_display": display_label(label),
                "group": group_raw_label(label),
                "score": score,
            }
            for label, score in sorted(raw_scores.items(), key=lambda item: item[1], reverse=True)[:8]
        ]
        return {"scores": grouped_scores, "raw_scores": raw_scores, "subgroup_scores": subgroup_scores}

    def _segment_polyp(self, image: Image.Image) -> dict[str, Any]:
        original = image.convert("RGB")
        original_size = original.size
        resized = original.resize((352, 352))
        input_array = np.expand_dims(np.asarray(resized).astype(np.float32), axis=0)

        prediction = self.segmentation_model.predict(input_array, verbose=0)
        mask = np.asarray(prediction)[0]
        if mask.ndim == 3:
            mask = mask[..., 0]
        binary_mask = (mask >= 0.5).astype(np.uint8) * 255
        mask_image = Image.fromarray(binary_mask, mode="L").resize(original_size)
        area_ratio = float(np.asarray(mask_image).mean() / 255.0)

        overlay = original.copy().convert("RGBA")
        red_layer = Image.new("RGBA", original_size, (220, 38, 38, 0))
        alpha = Image.fromarray((np.asarray(mask_image) > 0).astype(np.uint8) * 115, mode="L")
        red_layer.putalpha(alpha)
        overlay = Image.alpha_composite(overlay, red_layer).convert("RGB")

        return {
            "has_polyp": True,
            "mask_base64": encode_png(mask_image.convert("RGB")),
            "overlay_base64": encode_png(overlay),
            "area_ratio": area_ratio,
        }

    @staticmethod
    def _clinical_assessment(
        label: str | None,
        is_low_confidence: bool,
        predicted_score: float,
        polyp: dict[str, Any],
    ) -> dict[str, Any]:
        confidence_level = "Thấp" if is_low_confidence else "Cao" if predicted_score >= 0.85 else "Trung bình"
        if is_low_confidence or label is None:
            return {
                "impression": "Chưa đủ cơ sở hình ảnh để đưa ra nhận định lâm sàng đáng tin cậy.",
                "confidence_level": confidence_level,
                "evidence": [
                    "Xác suất giữa các nhóm bệnh chưa đủ tách biệt.",
                    "Ảnh có thể cần được chụp rõ hơn hoặc đối chiếu thêm nhiều frame nội soi.",
                ],
                "missing_context": [
                    "Vị trí giải phẫu chính xác của ảnh.",
                    "Chuỗi ảnh/video nội soi trước và sau vùng nghi ngờ.",
                    "Triệu chứng, tiền sử bệnh và nhận định trực tiếp của bác sĩ nội soi.",
                ],
                "recommendations": [
                    "Không nên dùng kết quả này để kết luận bệnh.",
                    "Bác sĩ nên xem lại ảnh gốc, chất lượng ảnh và cân nhắc chụp/nhập thêm ảnh khác.",
                ],
                "urgency": "Cần đối chiếu thêm",
            }

        label_key = normalize_label_key(label)

        if is_polyp_label(label):
            area_ratio = polyp.get("area_ratio")
            area_text = f"Vùng mask chiếm khoảng {round(area_ratio * 100, 1)}% diện tích ảnh." if area_ratio else "Đã có vùng mask nghi ngờ nhưng chưa ước lượng được tỷ lệ diện tích."
            return {
                "impression": "Hình ảnh gợi ý tổn thương dạng polyp hoặc vùng niêm mạc lồi; chưa đủ để xác định bản chất lành tính hay ác tính.",
                "confidence_level": confidence_level,
                "evidence": [
                    "Mô hình phân loại ưu tiên lớp polyp.",
                    area_text,
                    "Overlay giúp khoanh vùng vị trí cần bác sĩ kiểm tra kỹ trên ảnh gốc.",
                ],
                "missing_context": [
                    "Vị trí giải phẫu và khoảng cách quan sát trong nội soi.",
                    "Kích thước thật của tổn thương theo mm/cm.",
                    "Hình thái Paris: có cuống, bán cuống, phẳng hay lõm.",
                    "Bề mặt, màu sắc, loét, chảy máu và dấu hiệu bất thường mạch máu.",
                    "Kết quả mô bệnh học nếu sinh thiết hoặc cắt polyp.",
                ],
                "recommendations": [
                    "Bác sĩ nội soi nên đối chiếu nhiều frame/góc nhìn để loại trừ nếp niêm mạc, bóng, dịch nhầy hoặc artefact.",
                    "Nếu tổn thương thật sự dạng polyp, cần đo kích thước, mô tả hình thái và cân nhắc sinh thiết/cắt polyp theo chỉ định.",
                    "Không dùng một ảnh đơn lẻ để kết luận ung thư hay mức độ loạn sản.",
                ],
                "urgency": "Ưu tiên bác sĩ xem lại",
            }

        if "esophagitis" in label_key:
            return {
                "impression": "Hình ảnh gợi ý viêm thực quản trong phạm vi các lớp mô hình đã học; cần phân độ và đối chiếu triệu chứng trước khi kết luận.",
                "confidence_level": confidence_level,
                "evidence": [
                    "Mô hình phân loại ưu tiên lớp viêm thực quản.",
                    "Kết quả phù hợp hơn với nhóm viêm so với bình thường hoặc polyp trong bộ dữ liệu huấn luyện.",
                ],
                "missing_context": [
                    "Vị trí tổn thương so với đường Z và tâm vị.",
                    "Mức độ trợt/loét, chiều dài tổn thương và phân độ Los Angeles nếu có.",
                    "Triệu chứng trào ngược, đau, nuốt nghẹn và tiền sử dùng thuốc.",
                ],
                "recommendations": [
                    "Bác sĩ nên phân độ tổn thương trên ảnh/video nội soi đầy đủ.",
                    "Cân nhắc sinh thiết nếu có loét, hẹp, tổn thương không điển hình hoặc nghi ngờ Barrett/ác tính.",
                ],
                "urgency": "Cần bác sĩ đối chiếu",
            }

        if "cancer" in label_key:
            return {
                "impression": "Hình ảnh được mô hình xếp vào nhóm nghi ngờ ung thư trong bộ dữ liệu GastroVision. Kết quả này chỉ là gợi ý từ ảnh và cần bác sĩ xác nhận bằng nội soi đầy đủ, sinh thiết và mô bệnh học.",
                "confidence_level": confidence_level,
                "evidence": [
                    f"Mô hình phân loại ưu tiên lớp {display_label(label)}.",
                    "Đây là nhóm nhãn nguy cơ cao nên không được kết luận chỉ dựa trên một ảnh đơn lẻ.",
                ],
                "missing_context": [
                    "Vị trí tổn thương, kích thước, hình thái, mức độ loét/chảy máu.",
                    "Chuỗi ảnh/video nội soi đầy đủ và kết quả sinh thiết nếu có.",
                    "Tiền sử bệnh, triệu chứng cảnh báo và nhận định trực tiếp của bác sĩ.",
                ],
                "recommendations": [
                    "Cần ưu tiên bác sĩ chuyên khoa xem lại và cân nhắc sinh thiết theo chỉ định.",
                    "Không dùng kết quả AI để tự kết luận ung thư.",
                ],
                "urgency": "Cần bác sĩ đối chiếu sớm",
            }

        if "ulcer" in label_key:
            return {
                "impression": "Hình ảnh được mô hình xếp vào nhóm ổ loét. Cần bác sĩ đánh giá vị trí, kích thước, nền loét và dấu hiệu chảy máu nếu có.",
                "confidence_level": confidence_level,
                "evidence": [f"Mô hình phân loại ưu tiên lớp {display_label(label)}."],
                "missing_context": [
                    "Vị trí ổ loét và đặc điểm bờ/nền loét.",
                    "Tình trạng xuất huyết, dùng thuốc kháng viêm, H. pylori và kết quả sinh thiết nếu nghi ngờ.",
                ],
                "recommendations": [
                    "Bác sĩ cần đối chiếu ảnh/video nội soi đầy đủ và chỉ định xử trí phù hợp.",
                ],
                "urgency": "Cần bác sĩ đối chiếu",
            }

        if "normal" in label_key:
            return {
                "impression": "Hình ảnh được mô hình xếp vào nhóm bình thường hoặc cấu trúc giải phẫu bình thường trong bộ dữ liệu đã học.",
                "confidence_level": confidence_level,
                "evidence": [
                    f"Mô hình phân loại ưu tiên lớp {display_label(label)}.",
                    "Không có vùng polyp được kích hoạt để phân đoạn trong kết quả hiện tại.",
                ],
                "missing_context": [
                    "Toàn bộ chuỗi ảnh/video nội soi.",
                    "Vị trí giải phẫu, chất lượng chuẩn bị và mức độ quan sát niêm mạc.",
                    "Triệu chứng lâm sàng và chỉ định nội soi.",
                ],
                "recommendations": [
                    "Bác sĩ vẫn cần đọc toàn bộ ca nội soi, không dựa vào một ảnh đơn lẻ.",
                    "Nếu triệu chứng hoặc hình ảnh khác còn nghi ngờ, cần đánh giá thêm theo quy trình lâm sàng.",
                ],
                "urgency": "Theo dõi theo bối cảnh lâm sàng",
            }

        return {
            "impression": f"Hình ảnh được mô hình xếp vào nhóm {display_label(label)} trong bộ dữ liệu GastroVision.",
            "confidence_level": confidence_level,
            "evidence": [
                f"Mô hình phân loại ưu tiên lớp {display_label(label)}.",
                "Kết quả cần được hiểu trong phạm vi các lớp dữ liệu đã huấn luyện.",
            ],
            "missing_context": [
                "Vị trí giải phẫu chính xác và chuỗi ảnh/video nội soi đầy đủ.",
                "Mô tả trực tiếp của bác sĩ nội soi, triệu chứng và tiền sử bệnh.",
            ],
            "recommendations": [
                "Bác sĩ cần đối chiếu kết quả AI với ảnh gốc và bối cảnh lâm sàng.",
                "Không dùng một ảnh đơn lẻ để đưa ra chẩn đoán cuối cùng.",
            ],
            "urgency": "Cần bác sĩ đối chiếu",
        }
    @staticmethod
    def _message(label: str | None, is_low_confidence: bool) -> str:
        if is_low_confidence or label is None:
            return "Chưa đủ căn cứ để nhận diện rõ ràng. Vui lòng sử dụng ảnh rõ hơn hoặc tham khảo ý kiến bác sĩ."
        return MESSAGES.get(label, f"Mô hình dự đoán nhóm {display_label(label)}. Cần bác sĩ đối chiếu với ảnh gốc và bối cảnh lâm sàng.")



def normalize_vietnamese(value: str) -> str:
    replacements = {
        "à": "a", "á": "a", "ạ": "a", "ả": "a", "ã": "a",
        "â": "a", "ầ": "a", "ấ": "a", "ậ": "a", "ẩ": "a", "ẫ": "a",
        "ă": "a", "ằ": "a", "ắ": "a", "ặ": "a", "ẳ": "a", "ẵ": "a",
        "è": "e", "é": "e", "ẹ": "e", "ẻ": "e", "ẽ": "e",
        "ê": "e", "ề": "e", "ế": "e", "ệ": "e", "ể": "e", "ễ": "e",
        "ì": "i", "í": "i", "ị": "i", "ỉ": "i", "ĩ": "i",
        "ò": "o", "ó": "o", "ọ": "o", "ỏ": "o", "õ": "o",
        "ô": "o", "ồ": "o", "ố": "o", "ộ": "o", "ổ": "o", "ỗ": "o",
        "ơ": "o", "ờ": "o", "ớ": "o", "ợ": "o", "ở": "o", "ỡ": "o",
        "ù": "u", "ú": "u", "ụ": "u", "ủ": "u", "ũ": "u",
        "ư": "u", "ừ": "u", "ứ": "u", "ự": "u", "ử": "u", "ữ": "u",
        "ỳ": "y", "ý": "y", "ỵ": "y", "ỷ": "y", "ỹ": "y",
        "đ": "d",
    }
    text = value.lower()
    return "".join(replacements.get(char, char) for char in text)


def build_clinical_notes(clinical_context: dict[str, str] | None) -> dict[str, Any]:
    if not clinical_context:
        return {"summary": "", "evidence": [], "recommendations": [], "urgency": None}

    age_text = (clinical_context.get("age") or "").strip()[:MAX_AGE_LEN]
    gender = (clinical_context.get("gender") or "").strip()[:MAX_GENDER_LEN]
    # Symptoms are user-controlled free text; cap length and collapse whitespace
    # so they can't inflate response size or break PDF layout.
    raw_symptoms = (clinical_context.get("symptoms") or "").strip()
    if len(raw_symptoms) > MAX_SYMPTOMS_LEN:
        raw_symptoms = raw_symptoms[:MAX_SYMPTOMS_LEN].rsplit(" ", 1)[0] + "…"
    symptoms = " ".join(raw_symptoms.split())
    normalized = normalize_vietnamese(symptoms)
    evidence: list[str] = []
    recommendations: list[str] = []
    urgency: str | None = None

    if symptoms:
        evidence.append(f"Triệu chứng người bệnh khai báo: {symptoms}.")
    if age_text or gender:
        patient_bits = []
        if age_text:
            patient_bits.append(f"{age_text} tuổi")
        if gender:
            patient_bits.append(gender.lower())
        evidence.append("Thông tin bệnh nhân: " + ", ".join(patient_bits) + ".")

    alarm_keywords = ["sut can", "xuat huyet", "phan den", "non ra mau", "thieu mau", "nuot nghen"]
    reflux_keywords = ["trao nguoc", "o chua", "nong rat", "nuot dau"]
    dyspepsia_keywords = ["dau thuong vi", "buon non", "kho tieu", "day bung", "dau bung"]

    if any(keyword in normalized for keyword in alarm_keywords):
        evidence.append("Có dấu hiệu cảnh báo như sụt cân, xuất huyết tiêu hóa, thiếu máu hoặc nuốt nghẹn.")
        recommendations.append("Nên ưu tiên bác sĩ xem lại ca nội soi và cân nhắc đánh giá thêm thay vì chỉ dựa vào ảnh đơn lẻ.")
        urgency = "Ưu tiên đối chiếu sớm"

    if any(keyword in normalized for keyword in reflux_keywords):
        evidence.append("Triệu chứng có hướng phù hợp với nhóm trào ngược/viêm thực quản.")
        recommendations.append("Nếu ảnh gợi ý viêm thực quản, bác sĩ cần đối chiếu thêm triệu chứng trào ngược và mức độ tổn thương.")

    if any(keyword in normalized for keyword in dyspepsia_keywords):
        evidence.append("Có triệu chứng đường tiêu hóa trên như đau thượng vị, buồn nôn hoặc khó tiêu.")
        recommendations.append("Cần kết hợp ảnh nội soi với vị trí đau, thời gian diễn tiến và tiền sử dùng thuốc.")

    try:
        age = int(age_text)
    except ValueError:
        age = None
    if age is not None and age >= 50:
        evidence.append("Tuổi từ 50 trở lên là yếu tố cần chú ý hơn khi đọc kết quả nội soi.")
        recommendations.append("Nên đối chiếu kỹ vùng nghi ngờ và tiền sử gia đình/bệnh nền nếu có.")
        urgency = urgency or "Cần bác sĩ đối chiếu"

    if not evidence:
        return {"summary": "", "evidence": [], "recommendations": [], "urgency": None}

    return {
        "summary": "Hệ thống đã dùng thêm thông tin lâm sàng do người dùng nhập để hỗ trợ diễn giải kết quả ảnh.",
        "evidence": evidence,
        "recommendations": recommendations,
        "urgency": urgency,
    }


def add_clinical_context_to_assessment(
    assessment: dict[str, Any],
    clinical_context: dict[str, str] | None,
) -> dict[str, Any]:
    clinical_notes = build_clinical_notes(clinical_context)
    if not clinical_notes["evidence"]:
        return assessment

    updated = dict(assessment)
    updated["impression"] = f"{assessment['impression']} {clinical_notes['summary']}"
    updated["evidence"] = [*clinical_notes["evidence"], *assessment.get("evidence", [])]
    updated["recommendations"] = [
        *clinical_notes["recommendations"],
        *assessment.get("recommendations", []),
    ]
    if clinical_notes["urgency"]:
        updated["urgency"] = clinical_notes["urgency"]
    return updated
def encode_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def decode_upload(contents: bytes) -> Image.Image:
    try:
        # Refuse decompression bombs before we allocate massive buffers.
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        image = Image.open(io.BytesIO(contents))
        image.load()  # forces full decode, so a bomb is caught here
        rgb = image.convert("RGB")
        # OOD sanity: a real endoscopy image should have spatial variation. A
        # fully uniform color (1 color, or very few distinct colors) almost
        # certainly means the user uploaded a wrong file. Sample pixels across
        # the whole image so we don't false-positive on images that happen to
        # have a uniform corner (some real endoscopy frames start black at the
        # lumen).
        width, height = rgb.size
        sample_count = min(4096, width * height)
        stride_x = max(1, width // 64)
        stride_y = max(1, height // 64)
        unique_colors = set()
        seen = 0
        for y in range(0, height, stride_y):
            for x in range(0, width, stride_x):
                unique_colors.add(rgb.getpixel((x, y)))
                seen += 1
                if seen >= sample_count:
                    break
            if seen >= sample_count:
                break
        if len(unique_colors) < 5:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ảnh gần như đơn sắc, có thể không phải ảnh nội soi hợp lệ. "
                    "Vui lòng chọn ảnh có nội dung rõ ràng."
                ),
            )
        return rgb
    except HTTPException:
        raise
    except Image.DecompressionBombError as exc:
        raise HTTPException(
            status_code=413,
            detail=f"Ảnh quá lớn sau khi giải nén. Giới hạn {MAX_IMAGE_PIXELS:,} pixels.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="File tải lên không phải ảnh hợp lệ.") from exc


inference = GastroVisionInference()
app = FastAPI(title="GastroVision AI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5175", "http://127.0.0.1:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if inference.status.classifier_loaded else "degraded",
        "models_loaded": inference.status.classifier_loaded,
        "classifier_loaded": inference.status.classifier_loaded,
        "segmentation_loaded": inference.status.segmentation_loaded,
        "classifier_error": inference.status.classifier_error,
        "segmentation_error": inference.status.segmentation_error,
        "classifier_path": str(SVM_MODEL_PATH),
        "scaler_path": str(SVM_SCALER_PATH),
        "labels_path": str(LABELS_PATH),
        "label_count": len(inference.labels),
        "report_labels": REPORT_LABELS,
        "architecture": "ResNet50 ImageNet backbone -> StandardScaler -> SVC (RBF) -> DeepLabV3+",
    }


@app.post("/api/analyze")
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    patient_age: str = Form(""),
    patient_gender: str = Form(""),
    patient_symptoms: str = Form(""),
) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file ảnh.")

    contents = await file.read()
    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if not contents:
        raise HTTPException(status_code=400, detail="File ảnh đang rỗng.")
    if len(contents) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File quá lớn. Dung lượng tối đa là {MAX_UPLOAD_SIZE_MB} MB.")

    image = decode_upload(contents)
    request_id = str(uuid.uuid4())
    logger.info(
        "analyze start request_id=%s filename=%s content_type=%s size=%d",
        request_id, file.filename, file.content_type, len(contents),
    )
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                inference.analyze,
                image,
                {"age": patient_age, "gender": patient_gender, "symptoms": patient_symptoms},
            ),
            timeout=INFERENCE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.exception("analyze timeout request_id=%s", request_id)
        raise HTTPException(
            status_code=504,
            detail=(
                f"Inference vượt quá {INFERENCE_TIMEOUT_SECONDS:.0f}s. "
                "Vui lòng thử lại hoặc dùng ảnh nhỏ hơn."
            ),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("analyze failed request_id=%s", request_id)
        raise HTTPException(status_code=500, detail="Lỗi xử lý ảnh. Vui lòng thử lại.") from exc

    logger.info(
        "analyze done request_id=%s label=%s low_conf=%s",
        request_id, result.get("label"), result.get("is_low_confidence"),
    )
    return {"success": True, "request_id": request_id, "result": result}























