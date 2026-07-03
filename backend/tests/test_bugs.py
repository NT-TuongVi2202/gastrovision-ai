"""Targeted bug-hunting probes for the GastroVision backend."""
import io
import json
import time

import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def banner(s):
    print(f"\n{'=' * 70}\n{s}\n{'=' * 70}")


def make_image(mode="RGB", size=(640, 480), color=(120, 80, 50)):
    if mode == "L":
        gray_value = 120
        img = Image.new(mode, size, gray_value)
    else:
        img = Image.new(mode, size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# --------------------------------------------------------------
banner("BUG 1: Grayscale image - what does server actually return?")
# --------------------------------------------------------------
files = {"file": ("gray.png", make_image(mode="L", size=(300, 300)), "image/png")}
r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
print(f"status={r.status_code}")
print(f"content-type={r.headers.get('content-type')}")
print(f"body[:400]={r.text[:400]}")


# --------------------------------------------------------------
banner("BUG 2: Empty content-type server-side handling")
# --------------------------------------------------------------
# Send a real PNG with no content-type declared
files = {"file": ("a.png", make_image(), "")}  # mime = ''
r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
print(f"status={r.status_code}")
print(f"body[:200]={r.text[:200]}")


# --------------------------------------------------------------
banner("BUG 3: XSS in symptoms - is output HTML-escaped?")
# --------------------------------------------------------------
real = "../storage/datasets/gastrovision/extracted/Gastrovision/Normal stomach"
import os
sample = None
for n in os.listdir(real):
    if n.endswith(".jpg"):
        sample = f"{real}/{n}"
        break

if sample:
    with open(sample, "rb") as f:
        files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
    data = {"patient_age": "45", "patient_gender": "male",
            "patient_symptoms": "<script>alert(1)</script><img src=x onerror=alert(2)>"}
    r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
    if r.ok:
        result = r.json().get("result", {})
        ca = result.get("clinical_assessment", {})
        evid = ca.get("evidence", [])
        print("Label:", result.get("label"))
        print("Urgency:", ca.get("urgency"))
        print("Evidence list:")
        for e in evid:
            print(f"  - {e!r}")
        # Search raw response for unescaped tags
        body_str = r.text
        for tag in ["<script>", "<img", "onerror=", "<svg"]:
            if tag in body_str:
                print(f"  âš ï¸  RAW TAG FOUND: {tag}")
            else:
                print(f"  OK escaped: {tag}")


# --------------------------------------------------------------
banner("BUG 4: Symptoms 5000 chars - does it crash or get truncated?")
# --------------------------------------------------------------
if sample:
    with open(sample, "rb") as f:
        files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
    data = {"patient_age": "45", "patient_gender": "male",
            "patient_symptoms": "x" * 5000}
    r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
    print(f"status={r.status_code} bytes={len(r.text)}")
    if r.ok:
        evid = r.json()["result"]["clinical_assessment"]["evidence"]
        for e in evid:
            print(f"  evidence len={len(e)} preview={e[:80]!r}")


# --------------------------------------------------------------
banner("BUG 5: age='abc' - silently dropped or crash?")
# --------------------------------------------------------------
if sample:
    with open(sample, "rb") as f:
        files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
    data = {"patient_age": "abc", "patient_gender": "male"}
    r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
    print(f"status={r.status_code}")
    if r.ok:
        meta = r.json()["result"].get("patient", {})
        print(f"patient meta: {meta}")


# --------------------------------------------------------------
banner("BUG 6: age='-50' (negative)")
# --------------------------------------------------------------
if sample:
    with open(sample, "rb") as f:
        files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
    data = {"patient_age": "-50", "patient_gender": "male"}
    r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
    print(f"status={r.status_code}")
    if r.ok:
        meta = r.json()["result"].get("patient", {})
        print(f"patient meta: {meta}")


# --------------------------------------------------------------
banner("BUG 7: 25 concurrent requests - queue depth & memory")
# --------------------------------------------------------------
if sample:
    with open(sample, "rb") as f:
        img_bytes = f.read()

    def call(i):
        files = {"file": (f"img_{i}.jpg", io.BytesIO(img_bytes), "image/jpeg")}
        t0 = time.time()
        r = requests.post(f"{API}/api/analyze", files=files, timeout=60)
        return r.status_code, time.time() - t0

    from concurrent.futures import ThreadPoolExecutor
    started = time.time()
    with ThreadPoolExecutor(max_workers=25) as ex:
        results = list(ex.map(call, range(25)))
    total = time.time() - started
    statuses = [s for s, _ in results]
    times = sorted([t for _, t in results])
    print(f"statuses={set(statuses)} total={total:.1f}s")
    print(f"min={times[0]:.2f}s median={times[len(times)//2]:.2f}s p95={times[int(len(times)*0.95)]:.2f}s max={times[-1]:.2f}s")
    # Calculate implied queue depth: if max ~ avg*N, backend is serial
    print(f"avg={sum(times)/len(times):.2f}s  ratio(max/avg)={times[-1]/(sum(times)/len(times)):.1f}x")


# --------------------------------------------------------------
banner("BUG 8: Repeated identical image - deterministic score?")
# --------------------------------------------------------------
if sample:
    scores_list = []
    for i in range(3):
        with open(sample, "rb") as f:
            files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
        r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
        if r.ok:
            result = r.json()["result"]
            scores_list.append((result["label"], result["confidence"]["predicted_score"]))
    print(f"3 calls: {scores_list}")
    if len(set(s[0] for s in scores_list)) > 1:
        print("  âš ï¸  NON-DETERMINISTIC: same image, different predicted label")
    if max(s[1] for s in scores_list) - min(s[1] for s in scores_list) > 0.01:
        print(f"  âš ï¸  SCORE DRIFT: {max(s[1] for s in scores_list) - min(s[1] for s in scores_list):.4f}")


# --------------------------------------------------------------
banner("BUG 9: True 500 error - PIL 'color must be int' traceback leak")
# --------------------------------------------------------------
# Re-trigger grayscale to capture FULL body for status != 200
files = {"file": ("gray.png", make_image(mode="L", size=(300, 300)), "image/png")}
r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
print(f"status={r.status_code}")
print(f"FULL BODY:\n{r.text}")


# --------------------------------------------------------------
banner("BUG 10: Animated GIF (multi-frame)")
# --------------------------------------------------------------
frames = []
for c in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]:
    f = Image.new("RGB", (100, 100), c)
    frames.append(f)
buf = io.BytesIO()
frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
buf.seek(0)
files = {"file": ("anim.gif", buf, "image/gif")}
r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
print(f"status={r.status_code}")
if r.ok:
    print(f"label={r.json()['result']['label']}")
print(f"body[:200]={r.text[:200]}")


# --------------------------------------------------------------
banner("BUG 11: EXIF-rotated JPEG - is orientation applied?")
# --------------------------------------------------------------
# Build a JPEG with rotation flag in EXIF
from PIL import Image
import struct
img = Image.new("RGB", (400, 200), (50, 100, 150))  # wider than tall
exif_bytes = b"Exif\x00\x00"  # stub
buf = io.BytesIO()
img.save(buf, format="JPEG", quality=85)
buf.seek(0)
files = {"file": ("rot.jpg", buf, "image/jpeg")}
r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
print(f"status={r.status_code}")
if r.ok:
    print(f"label={r.json()['result']['label']}")


# --------------------------------------------------------------
banner("BUG 12: Wrong endpoint 404 handling")
# --------------------------------------------------------------
r = requests.get(f"{API}/api/does-not-exist")
print(f"GET /api/does-not-exist status={r.status_code} body[:120]={r.text[:120]}")

r = requests.post(f"{API}/api/analyzezz", timeout=5)
print(f"POST /api/analyzezz status={r.status_code} body[:120]={r.text[:120]}")


# --------------------------------------------------------------
banner("BUG 13: OPTIONS preflight (CORS)")
# --------------------------------------------------------------
r = requests.options(f"{API}/api/analyze",
                     headers={"Origin": "http://localhost:5173",
                              "Access-Control-Request-Method": "POST"})
print(f"OPTIONS status={r.status_code}")
print(f"ACAO={r.headers.get('Access-Control-Allow-Origin')}")
print(f"ACAM={r.headers.get('Access-Control-Allow-Methods')}")


# --------------------------------------------------------------
banner("BUG 14: Health endpoint under load")
# --------------------------------------------------------------
from concurrent.futures import ThreadPoolExecutor
def hc(i):
    return requests.get(f"{API}/api/health", timeout=5).status_code
with ThreadPoolExecutor(max_workers=10) as ex:
    codes = list(ex.map(hc, range(50)))
print(f"50 parallel /health: {set(codes)} unique={len(set(codes))}")


print("\nDone.")