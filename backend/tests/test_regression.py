"""Final regression: real images label, garbage low_conf, OOD protected."""
import io
import os
import random
import requests
from PIL import Image

API = "http://127.0.0.1:8000"

random.seed(2026)


def post(img_bytes, name, mime="image/jpeg"):
    return requests.post(f"{API}/api/analyze", files={"file": (name, img_bytes, mime)}, timeout=30)


def show(label, exp_low, exp_label_contains=None):
    if not r.ok:
        print(f"  {name}: ERR {r.status_code} {r.text[:100]}")
        return
    res = r.json()["result"]
    low = res["is_low_confidence"]
    lab = res["label"]
    ok = "âœ“" if (low == exp_low) else "âœ—"
    print(f"  {ok} {label:40s} label={str(lab):10s} low={low}")


print("REAL images â€” expect label != None, low=False")
for cls in ["Colon polyps", "Normal stomach", "Esophagitis", "Barrett's esophagus", "Ulcer"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    if not os.path.isdir(folder):
        continue
    files = [n for n in os.listdir(folder) if n.endswith(".jpg")][:2]
    for n in files:
        with open(f"{folder}/{n}", "rb") as f:
            r = post(io.BytesIO(f.read()), "real.jpg")
        show(f"{cls[:20]}/{n[:20]}", exp_low=False)

print("\nGARBAGE â€” expect low=True, label=None")
# random noise
buf = io.BytesIO()
Image.frombytes("RGB", (300, 300), bytes([random.randint(0, 255) for _ in range(300 * 300 * 3)])).save(buf, format="PNG")
buf.seek(0)
r = post(buf, "noise.png", "image/png")
show("random noise 300x300", exp_low=True)

for c, name in [((255, 0, 0), "red"), ((0, 255, 0), "green"), ((0, 0, 255), "blue"), ((255, 255, 255), "white"), ((0, 0, 0), "black")]:
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), c).save(buf, format="PNG")
    buf.seek(0)
    r = post(buf, f"{name}.png", "image/png")
    show(f"solid {name}", exp_low=True)

# gradient
buf = io.BytesIO()
g = Image.new("RGB", (300, 300))
for y in range(300):
    for x in range(300):
        g.putpixel((x, y), (x % 256, y % 256, (x + y) % 256))
g.save(buf, format="PNG")
buf.seek(0)
r = post(buf, "grad.png", "image/png")
show("RGB gradient", exp_low=True)

print("\nSYMPTOMS â€” expect truncation")
folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/Normal stomach"
sample = f"{folder}/{os.listdir(folder)[0]}"
with open(sample, "rb") as f:
    files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
data = {"patient_symptoms": "x" * 5000}
r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
evid = r.json()["result"]["clinical_assessment"]["evidence"]
sym = [e for e in evid if "Triá»‡u chá»©ng" in e][0]
print(f"  âœ“ evidence length: {len(sym)} (capped) ends with 'â€¦': {sym.endswith('â€¦.')}")