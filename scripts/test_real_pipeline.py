"""End-to-end test of the REAL manga-image-translator pipeline.
First call will download model weights (~1 GB) and may take several minutes."""
import requests, base64, sys, time

# Load the Japanese test image
with open("/tmp/test_manga_jp.png", "rb") as f:
    img_bytes = f.read()
b64 = base64.b64encode(img_bytes).decode("ascii")

# Submit translation request
print("Submitting /translate/json with target_lang=es, detector=ctd, ocr=manga_ocr, translator=google, inpainter=lama, renderer=manga2eng")
print("This will download model weights on first call (~1 GB total). Be patient...")

# Use a long timeout for the first call (model downloads + CPU inference)
t0 = time.time()
try:
    r = requests.post(
        "http://localhost:8000/translate/json",
        json={
            "image": b64,
            "target_lang": "es",
            "source_lang": "auto",
            "detector": "ctd",
            "ocr": "manga_ocr",
            "translator": "google",
            "inpainter": "lama",
            "renderer": "manga2eng",
            "font_family": "comic",
            "font_size": 0,
            "return_metadata": True,
        },
        timeout=900,  # 15 minutes max
    )
except Exception as e:
    print(f"Request failed: {e}")
    sys.exit(1)

elapsed = time.time() - t0
print(f"\nHTTP {r.status_code} in {elapsed:.1f}s")
payload = r.json()
if not payload.get("success"):
    print("FAILED:", payload.get("error"))
    print("backend_used:", payload.get("backend_used"))
    sys.exit(1)

print(f"\n✓ SUCCESS in {elapsed:.1f}s ({payload.get('processing_time_ms')}ms internal)")
print(f"  regions: {payload.get('region_count')}")
print(f"  backend_used: {payload.get('backend_used')}")
print()
print("--- Detected regions ---")
for reg in payload.get("regions", []):
    src = reg.get("source_text", "")
    tgt = reg.get("translated_text", "")
    print(f"  #{reg['index']} src={src!r}")
    print(f"       tgt={tgt!r}")
print()

# Save translated image
out_bytes = base64.b64decode(payload["translated_image"])
with open("/tmp/test_manga_jp_translated.png", "wb") as f:
    f.write(out_bytes)
print(f"Translated image saved -> /tmp/test_manga_jp_translated.png")
