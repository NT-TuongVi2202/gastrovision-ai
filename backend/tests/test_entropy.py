"""Check entropy distribution for real vs garbage to find a good OOD threshold."""
import io
import os
import random
import numpy as np
import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def analyze(img_bytes, name, mime="image/jpeg"):
    r = requests.post(
        f"{API}/api/analyze",
        files={"file": (name, img_bytes, mime)},
        timeout=30,
    )
    res = r.json()["result"]
    raw = res["confidence"]["raw_scores"]
    arr = np.array(sorted(raw.values(), reverse=True), dtype=np.float64)
    arr = np.clip(arr, 1e-9, 1.0)
    arr = arr / arr.sum()
    H = float(-np.sum(arr * np.log(arr)))
    Hmax = float(np.log(len(raw)))
    return res["label"], res["is_low_confidence"], raw, H / Hmax, max(raw.values())


print("=" * 60)
print("REAL IMAGES")
print("=" * 60)
for cls in ["Colon polyps", "Normal stomach", "Esophagitis", "Barrett's esophagus", "Ulcer"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    if not os.path.isdir(folder):
        print(f"  skip {cls}: not found")
        continue
    files = [n for n in os.listdir(folder) if n.endswith(".jpg")][:2]
    for n in files:
        with open(f"{folder}/{n}", "rb") as f:
            label, low, raw, Hn, top = analyze(io.BytesIO(f.read()), "real.jpg")
        print(f"  {cls[:20]:20s} label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")

print()
print("=" * 60)
print("GARBAGE")
print("=" * 60)

# random noise
random.seed(42)
noise = Image.frombytes("RGB", (300, 300), bytes([random.randint(0, 255) for _ in range(300 * 300 * 3)]))
buf = io.BytesIO()
noise.save(buf, format="PNG")
buf.seek(0)
label, low, raw, Hn, top = analyze(buf, "noise.png", "image/png")
print(f"  random noise 300x300: label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")

# solid red
buf = io.BytesIO()
Image.new("RGB", (300, 300), (255, 0, 0)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, Hn, top = analyze(buf, "red.png", "image/png")
print(f"  solid red:             label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")

# solid white
buf = io.BytesIO()
Image.new("RGB", (300, 300), (255, 255, 255)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, Hn, top = analyze(buf, "white.png", "image/png")
print(f"  solid white:           label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")

# solid black
buf = io.BytesIO()
Image.new("RGB", (300, 300), (0, 0, 0)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, Hn, top = analyze(buf, "black.png", "image/png")
print(f"  solid black:           label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")

# gradient
buf = io.BytesIO()
grad = Image.new("RGB", (300, 300))
for y in range(300):
    for x in range(300):
        grad.putpixel((x, y), (x % 256, y % 256, (x + y) % 256))
grad.save(buf, format="PNG")
buf.seek(0)
label, low, raw, Hn, top = analyze(buf, "grad.png", "image/png")
print(f"  RGB gradient:          label={str(label)[:10]:10s} low={low} Hn={Hn:.3f} top={top:.3f}")