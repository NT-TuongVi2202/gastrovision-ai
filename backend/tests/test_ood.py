"""Try a different OOD approach: check std of raw scores.
Real images: std is high (one dominant).
Garbage: too uniform across the top 10? Let's see.
"""
import io
import os
import random
import numpy as np
import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def analyze(img_bytes, name, mime="image/jpeg"):
    r = requests.post(f"{API}/api/analyze", files={"file": (name, img_bytes, mime)}, timeout=30)
    res = r.json()["result"]
    raw = res["confidence"]["raw_scores"]
    arr = sorted(raw.values(), reverse=True)
    return res["label"], res["is_low_confidence"], raw, arr


def stats(name, label, low, arr):
    a = np.array(arr)
    top10 = a[:10]
    print(f"  {name:30s} label={str(label)[:10]:10s} low={low} top10_sum={top10.sum():.3f} top5={arr[:5]}")


# Real
for cls in ["Colon polyps", "Normal stomach"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    files = [n for n in os.listdir(folder) if n.endswith(".jpg")][:1]
    for n in files:
        with open(f"{folder}/{n}", "rb") as f:
            label, low, raw, arr = analyze(io.BytesIO(f.read()), "real.jpg")
        stats(f"real/{cls[:15]}/{n[:8]}", label, low, arr)

# Garbage
random.seed(7)
buf = io.BytesIO()
Image.frombytes("RGB", (300, 300), bytes([random.randint(0, 255) for _ in range(300 * 300 * 3)])).save(buf, format="PNG")
buf.seek(0)
label, low, raw, arr = analyze(buf, "noise.png", "image/png")
stats("noise 300x300", label, low, arr)

buf = io.BytesIO()
Image.new("RGB", (300, 300), (255, 0, 0)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, arr = analyze(buf, "red.png", "image/png")
stats("red 300x300", label, low, arr)

# Try a real-life photo (different distribution)
buf = io.BytesIO()
Image.new("RGB", (300, 300), (50, 200, 50)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, arr = analyze(buf, "green.png", "image/png")
stats("green 300x300", label, low, arr)

# Try a 1x1 image (degenerate)
buf = io.BytesIO()
Image.new("RGB", (1, 1), (128, 128, 128)).save(buf, format="PNG")
buf.seek(0)
label, low, raw, arr = analyze(buf, "1x1.png", "image/png")
stats("1x1 pixel", label, low, arr)