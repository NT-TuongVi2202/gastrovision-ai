"""Concurrency torture test."""
import io
import os
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def make_img():
    img = Image.new("RGB", (640, 480), (120, 80, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def call(payload):
    files = {"file": ("img.jpg", payload, "image/jpeg")}
    t0 = time.time()
    try:
        r = requests.post(f"{API}/api/analyze", files=files, timeout=120)
        return r.status_code, time.time() - t0, len(r.text)
    except Exception as e:
        return "EXC", time.time() - t0, str(e)


img = make_img()

print("=" * 70)
print("TEST: 100 concurrent identical requests")
print("=" * 70)
started = time.time()
with ThreadPoolExecutor(max_workers=50) as ex:
    results = list(ex.map(call, [io.BytesIO(img.getvalue()) for _ in range(100)]))
total = time.time() - started
statuses = {}
for s, _, _ in results:
    statuses[s] = statuses.get(s, 0) + 1
print(f"Total: {total:.1f}s | statuses: {statuses}")

print("=" * 70)
print("TEST: Burst of 50 then poll /health for memory leak")
print("=" * 70)
with ThreadPoolExecutor(max_workers=50) as ex:
    list(ex.map(call, [io.BytesIO(img.getvalue()) for _ in range(50)]))
time.sleep(1)
h = requests.get(f"{API}/api/health").json()
print(f"Health after burst: classifier_loaded={h['classifier_loaded']} classifier_error={h.get('classifier_error')}")

print("=" * 70)
print("TEST: Same client repeats, does session leak?")
print("=" * 70)
sess = requests.Session()
for i in range(5):
    files = {"file": ("img.jpg", io.BytesIO(img.getvalue()), "image/jpeg")}
    r = sess.post(f"{API}/api/analyze", files=files, timeout=60)
    print(f"  call {i}: status={r.status_code}")

print("=" * 70)
print("TEST: 1MB PNG vs 100KB JPEG vs 5MB PNG - latency distribution")
print("=" * 70)

big = io.BytesIO()
Image.new("RGB", (3000, 3000), (100, 100, 100)).save(big, format="PNG")
big.seek(0)
big_bytes = big.getvalue()
print(f"3K x 3K PNG = {len(big_bytes)/1024:.0f} KB")

t = io.BytesIO()
Image.new("RGB", (800, 600), (50, 50, 50)).save(t, format="JPEG", quality=70)
t.seek(0)
small_bytes = t.getvalue()
print(f"800x600 JPEG = {len(small_bytes)/1024:.0f} KB")

import statistics
for label, data in [("big", big_bytes), ("small", small_bytes)]:
    times = []
    for i in range(5):
        files = {"file": ("img.jpg", io.BytesIO(data), "image/jpeg")}
        t0 = time.time()
        r = requests.post(f"{API}/api/analyze", files=files, timeout=60)
        times.append(time.time() - t0)
    print(f"  {label}: times={[f'{x:.2f}' for x in times]} avg={statistics.mean(times):.2f}s max={max(times):.2f}s")

print("Done.")