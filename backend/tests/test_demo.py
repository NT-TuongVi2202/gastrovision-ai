"""Smoke tests for the GastroVision backend.

Run with the venv:
    .venv\Scripts\python.exe test_demo.py
"""
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image

API = "http://127.0.0.1:8000"


def make_image(mode="RGB", size=(640, 480), color=(120, 80, 50)):
    img = Image.new(mode, size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def make_corrupt_image(size_kb=100):
    return io.BytesIO(b"not an image " * (size_kb * 64))


def find_real_image():
    base = "../storage/datasets/gastrovision/extracted/Gastrovision"
    for cls in ("Colon polyps", "Esophagitis", "Normal stomach"):
        for name in os.listdir(f"{base}/{cls}"):
            if name.endswith(".jpg"):
                return f"{base}/{cls}/{name}", cls
    return None, None


def print_header(title):
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def run(name, fn):
    print(f"  [{name}] ... ", end="", flush=True)
    try:
        result = fn()
        print(f"OK  {result}")
        return result
    except Exception as exc:
        print(f"FAIL  {exc}")
        return exc


# ===================== TEST 2: Input validation =====================
print_header("TEST 2: Input validation")

def test_no_file():
    r = requests.post(f"{API}/api/analyze", timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

def test_text_file():
    files = {"file": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

def test_pdf():
    files = {"file": ("report.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

def test_empty_file():
    files = {"file": ("empty.jpg", io.BytesIO(b""), "image/jpeg")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

def test_corrupt_image():
    files = {"file": ("bad.jpg", make_corrupt_image(50), "image/jpeg")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

def test_oversize_file():
    big = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024))
    files = {"file": ("big.png", big, "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

run("No file", test_no_file)
run("Text file", test_text_file)
run("PDF file", test_pdf)
run("Empty file", test_empty_file)
run("Corrupt image", test_corrupt_image)
run("Oversize 6MB", test_oversize_file)


# ===================== TEST 3: Edge cases áº£nh =====================
print_header("TEST 3: Image edge cases")

def test_tiny_image():
    files = {"file": ("tiny.png", make_image(size=(1, 1)), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} (label={r.json().get('result', {}).get('label', '?')})"

def test_huge_image():
    files = {"file": ("huge.png", make_image(size=(8000, 6000)), "image/png")}
    started = time.time()
    r = requests.post(f"{API}/api/analyze", files=files, timeout=60)
    return f"status={r.status_code} time={time.time()-started:.1f}s"

def test_rgba():
    files = {"file": ("rgba.png", make_image(mode="RGBA", size=(300, 300)), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} label={r.json().get('result', {}).get('label', '?')}"

def test_grayscale():
    files = {"file": ("gray.png", make_image(mode="L", size=(300, 300)), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} label={r.json().get('result', {}).get('label', '?')}"

def test_16bit():
    img = Image.new("I;16", (200, 200), 32768)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    files = {"file": ("16bit.png", buf, "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:120]}"

run("1x1 pixel", test_tiny_image)
run("8000x6000 huge", test_huge_image)
run("RGBA mode", test_rgba)
run("Grayscale", test_grayscale)
run("16-bit PNG", test_16bit)


# ===================== TEST 4: Concurrency =====================
print_header("TEST 4: Concurrency + real image")

real_path, expected_class = find_real_image()
if real_path:
    print(f"  Using real image: {expected_class} -> {real_path}")

    with open(real_path, "rb") as f:
        real_bytes = f.read()

    def single_call(i):
        files = {"file": (f"img_{i}.jpg", io.BytesIO(real_bytes), "image/jpeg")}
        r = requests.post(f"{API}/api/analyze", files=files, timeout=60)
        return r.status_code, r.elapsed.total_seconds()

    started = time.time()
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(single_call, range(10)))
    total = time.time() - started
    statuses = [s for s, _ in results]
    times = [t for _, t in results]
    print(f"  [10 parallel calls] statuses={set(statuses)} total={total:.1f}s avg={sum(times)/len(times):.2f}s max={max(times):.2f}s")
else:
    print("  No real image found!")


# ===================== TEST 5: Clinical context =====================
print_header("TEST 5: Clinical context edge cases")

if real_path:
    def post_with_context(age, gender, symptoms, label):
        with open(real_path, "rb") as f:
            files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
        data = {"patient_age": age, "patient_gender": gender, "patient_symptoms": symptoms}
        r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
        result = r.json().get("result", {})
        ca = result.get("clinical_assessment", {})
        urg = ca.get("urgency", "n/a")
        return f"label={result.get('label','?')} urgency={urg} evid_count={len(ca.get('evidence',[]))}"

    print(f"  [empty context]     ", post_with_context("", "", "", "empty"))
    print(f"  [age=abc]            ", post_with_context("abc", "male", "dau bung", "age invalid"))
    print(f"  [age=200]            ", post_with_context("200", "unknown", "", "age out of range"))
    print(f"  [symptoms=XSS]       ", post_with_context("45", "male", "<script>alert(1)</script>", "XSS attempt"))
    print(f"  [symptoms=5000chars] ", post_with_context("45", "male", "x" * 5000, "huge symptoms"))
    print(f"  [alarm keywords VN]  ", post_with_context("65", "male", "sut can, xuat huyet, nuot nghen", "alarm"))
    print(f"  [age=49]             ", post_with_context("49", "female", "trao nguoc, o chua", "below 50"))
    print(f"  [age=50]             ", post_with_context("50", "female", "trao nguoc, o chua", "boundary 50"))


# ===================== TEST 6: Security =====================
print_header("TEST 6: Security probes")

def test_path_traversal():
    files = {"file": ("../../../etc/passwd", make_image(), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code}"

def test_huge_filename():
    name = "A" * 5000 + ".png"
    files = {"file": (name, make_image(), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code}"

def test_unicode_filename():
    files = {"file": ("áº£nh_ná»™i_soi_Ä‘áº·c_biá»‡t_ðŸ©º.png", make_image(), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code}"

def test_sql_injection_filename():
    files = {"file": ("'; DROP TABLE users;--.png", make_image(), "image/png")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code}"

def test_no_content_type():
    files = {"file": ("a.png", make_image(), "")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code}"

def test_wrong_content_type():
    files = {"file": ("a.png", make_image(), "application/zip")}
    r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
    return f"status={r.status_code} body={r.text[:80]}"

run("Path traversal filename", test_path_traversal)
run("5000-char filename", test_huge_filename)
run("Unicode filename", test_unicode_filename)
run("SQL injection filename", test_sql_injection_filename)
run("Empty content-type", test_no_content_type)
run("Wrong content-type", test_wrong_content_type)


# ===================== TEST 7: Missing fields =====================
print_header("TEST 7: Missing/malformed fields")

if real_path:
    def test_no_patient_fields():
        with open(real_path, "rb") as f:
            files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
        r = requests.post(f"{API}/api/analyze", files=files, timeout=30)
        return f"status={r.status_code} label={r.json().get('result', {}).get('label', '?')}"

    def test_patient_age_only():
        with open(real_path, "rb") as f:
            files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
        r = requests.post(f"{API}/api/analyze", files=files, data={"patient_age": "45"}, timeout=30)
        return f"status={r.status_code}"

    def test_extra_unknown_fields():
        with open(real_path, "rb") as f:
            files = {"file": ("img.jpg", io.BytesIO(f.read()), "image/jpeg")}
        data = {"patient_age": "45", "patient_gender": "male", "patient_blood_type": "O+", "admin": "true"}
        r = requests.post(f"{API}/api/analyze", files=files, data=data, timeout=30)
        return f"status={r.status_code}"

    run("Only file, no patient fields", test_no_patient_fields)
    run("Only patient_age", test_patient_age_only)
    run("Extra unknown fields", test_extra_unknown_fields)

print("\nDone.")
