"""Try to trigger low_confidence=true path"""
import io
import random
import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def make_specific(rgb_set, size=(300, 300)):
    """Multi-region image with diverse colors that ResNet might classify as accessory/tools (grouped=esophagitis)."""
    img = Image.new("RGB", size, (200, 200, 200))
    for c in rgb_set:
        x = random.randint(0, 200)
        y = random.randint(0, 200)
        for dx in range(40):
            for dy in range(40):
                if x + dx < size[0] and y + dy < size[1]:
                    img.putpixel((x + dx, y + dy), c)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def call(buf, name):
    r = requests.post(f"{API}/api/analyze", files={"file": (name, buf, "image/png")}, timeout=30)
    if r.ok:
        res = r.json()["result"]
        return res["label"], res["label_display"], res["is_low_confidence"], res["confidence"]["scores"]
    return None, None, None, r.text[:80]


# Try many random compositions
random.seed(123)
for trial in range(20):
    palette = [(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)) for _ in range(8)]
    buf = make_specific(palette)
    label, display, low, scores = call(buf, f"trial_{trial}.png")
    if low is True:
        print(f"trial {trial}: label={label} low_conf={low} scores={scores}")
    elif label is None:
        print(f"trial {trial}: NULL LABEL! scores={scores}")
    else:
        # group check
        pass

# Look at what scores look like for real endoscopy image
print("\n--- Real image scores for comparison ---")
import os
for cls in ["Colon polyps", "Normal stomach"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    sample = f"{folder}/{os.listdir(folder)[0]}"
    with open(sample, "rb") as f:
        r = requests.post(f"{API}/api/analyze", files={"file": ("real.jpg", f, "image/jpeg")}, timeout=30)
    res = r.json()["result"]
    print(f"{cls}: low={res['is_low_confidence']} scores={res['confidence']['scores']}")
    print(f"  raw top-3: {sorted(res['confidence']['raw_scores'].items(), key=lambda x:-x[1])[:3]}")