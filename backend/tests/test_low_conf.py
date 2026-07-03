"""Test edge case: low confidence + label=null path"""
import io
import random
import requests
from PIL import Image

API = "http://127.0.0.1:8000"

# 1. Random noise
random.seed(42)
noise_bytes = bytes([random.randint(0, 255) for _ in range(200 * 200 * 3)])
img = Image.frombytes("RGB", (200, 200), noise_bytes)
buf = io.BytesIO()
img.save(buf, format="PNG")
buf.seek(0)

print("=" * 70)
print("Test: random noise image")
print("=" * 70)
r = requests.post(f"{API}/api/analyze", files={"file": ("noise.png", buf, "image/png")}, timeout=30)
print(f"status={r.status_code}")
if r.ok:
    res = r.json()["result"]
    print(f"label={res['label']!r}")
    print(f"label_display={res['label_display']!r}")
    print(f"is_low_confidence={res['is_low_confidence']}")
    print(f"predicted_score={res['confidence']['predicted_score']:.4f}")
    print(f"scores={res['confidence']['scores']}")
    # Mô phỏng frontend buildSystemAgreementDraft
    result = res
    confidencePercent = round(result["confidence"]["predicted_score"] * 100)
    note = f"Kết quả hình ảnh gợi ý {result['label_display']} với xác suất {confidencePercent}%."
    print(f"\nFRONTEND DRAFT NOTE: {note!r}")

# 2. Solid color - completely uniform
print("\n" + "=" * 70)
print("Test: solid red color (200x200)")
print("=" * 70)
img = Image.new("RGB", (200, 200), (255, 0, 0))
buf = io.BytesIO()
img.save(buf, format="PNG")
buf.seek(0)
r = requests.post(f"{API}/api/analyze", files={"file": ("red.png", buf, "image/png")}, timeout=30)
print(f"status={r.status_code}")
if r.ok:
    res = r.json()["result"]
    print(f"label={res['label']!r} label_display={res['label_display']!r} low_conf={res['is_low_confidence']}")
    print(f"scores={res['confidence']['scores']}")
    print(f"raw top-3:")
    raw = res["confidence"]["raw_scores"]
    top3 = sorted(raw.items(), key=lambda x: -x[1])[:3]
    for k, v in top3:
        print(f"  {k}: {v:.4f}")