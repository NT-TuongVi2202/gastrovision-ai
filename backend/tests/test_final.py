"""Final regression: real label, garbage caught, real uncertainty caught."""
import io
import os
import random
import requests
from PIL import Image

API = "http://127.0.0.1:8000"
random.seed(2026)


def post(img_bytes, name, mime="image/jpeg"):
    return requests.post(f"{API}/api/analyze", files={"file": (name, img_bytes, mime)}, timeout=30)


def show(name, exp_low):
    if not r.ok:
        print(f"  {name}: ERR {r.status_code} {r.text[:100]}")
        return
    res = r.json()["result"]
    low = res["is_low_confidence"]
    lab = res["label"]
    ok = "âœ“" if low == exp_low else "âœ—"
    print(f"  {ok} {name:42s} label={str(lab):14s} low={low}")


print("=" * 60)
print("REAL images â€” expect label != None, low=False")
print("=" * 60)
for cls in ["Colon polyps", "Normal stomach", "Esophagitis", "Barrett's esophagus", "Ulcer", "Gastric polyps", "Colorectal cancer"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    if not os.path.isdir(folder):
        continue
    files = [n for n in os.listdir(folder) if n.endswith(".jpg")][:2]
    for n in files:
        with open(f"{folder}/{n}", "rb") as f:
            r = post(io.BytesIO(f.read()), "real.jpg")
        show(f"real/{cls[:20]}/{n[:15]}", exp_low=False)

print()
print("=" * 60)
print("GARBAGE â€” expect 400 (uniform) or low=True")
print("=" * 60)
# solid colors â€” should be rejected at decode (uniform)
for c, name in [((255, 0, 0), "red"), ((0, 255, 0), "green"), ((0, 0, 255), "blue"), ((255, 255, 255), "white"), ((0, 0, 0), "black")]:
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), c).save(buf, format="PNG")
    buf.seek(0)
    r = post(buf, f"{name}.png", "image/png")
    show(f"solid {name}", exp_low=True)

# Random noise â€” not uniform, should fall through decode then be low_conf
buf = io.BytesIO()
Image.frombytes("RGB", (300, 300), bytes([random.randint(0, 255) for _ in range(300 * 300 * 3)])).save(buf, format="PNG")
buf.seek(0)
r = post(buf, "noise.png", "image/png")
show("random noise 300x300", exp_low=True)

# Gradient (3 colors in 4096 sample = might pass uniform check)
buf = io.BytesIO()
g = Image.new("RGB", (300, 300))
for y in range(300):
    for x in range(300):
        g.putpixel((x, y), (x % 256, y % 256, (x + y) % 256))
g.save(buf, format="PNG")
buf.seek(0)
r = post(buf, "grad.png", "image/png")
show("RGB gradient", exp_low=True)

# Stripes (4+ colors in sample)
buf = io.BytesIO()
s = Image.new("RGB", (300, 300))
for x in range(300):
    color = (x % 4) * 60
    for y in range(300):
        s.putpixel((x, y), (color, color, color))
s.save(buf, format="PNG")
buf.seek(0)
r = post(buf, "stripes.png", "image/png")
show("stripes (4 grays)", exp_low=True)

print()
print("=" * 60)
print("EDGE â€” keep working")
print("=" * 60)
# Empty
r = requests.post(f"{API}/api/analyze", timeout=10)
print(f"  no file: status={r.status_code}")
# text file
r = post(io.BytesIO(b"hello"), "x.txt", "text/plain")
print(f"  text file: status={r.status_code} body={r.text[:80]}")
# huge file
big = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024))
r = post(big, "big.png", "image/png")
print(f"  6MB png: status={r.status_code} body={r.text[:80]}")

print()
print("=" * 60)
print("SYMPTOMS â€” truncated")
print("=" * 60)
folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/Normal stomach"
sample = f"{folder}/{os.listdir(folder)[0]}"
with open(sample, "rb") as f:
    files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
data = {"patient_symptoms": "x" * 5000}
r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
evid = r.json()["result"]["clinical_assessment"]["evidence"]
sym = [e for e in evid if "Triá»‡u chá»©ng" in e][0]
print(f"  evidence len={len(sym)} ends: {sym[-15:]!r}")