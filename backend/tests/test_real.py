"""Verify real images still label correctly after fix."""
import os
import requests

for cls in ["Colon polyps", "Normal stomach"]:
    folder = f"../storage/datasets/gastrovision/extracted/Gastrovision/{cls}"
    sample = f"{folder}/{os.listdir(folder)[0]}"
    with open(sample, "rb") as f:
        r = requests.post(
            "http://127.0.0.1:8000/api/analyze",
            files={"file": ("real.jpg", f, "image/jpeg")},
            timeout=30,
        )
    res = r.json()["result"]
    print(f"{cls}:")
    print(f"  label={res['label']!r}  low_conf={res['is_low_confidence']}  score={res['confidence']['predicted_score']:.4f}")
    raw = res["confidence"]["raw_scores"]
    top = sorted(raw.items(), key=lambda x: -x[1])[:3]
    print(f"  top-3 raw: {top}")