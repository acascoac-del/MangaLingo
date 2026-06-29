"""Verify that the Next.js proxy /api/translate works end-to-end (not just the
Python service directly)."""
import requests, base64, sys

with open("/tmp/test_panel.png", "rb") as f:
    files = {"image": f}
    data = {
        "target_lang": "es",
        "source_lang": "auto",
        "detector": "opencv",
        "ocr": "tesseract",
        "translator": "google",
        "inpainter": "opencv",
        "renderer": "pillow",
        "font_family": "comic",
    }
    print("POST /api/translate (via Next.js proxy) ...")
    r = requests.post("http://localhost:3000/api/translate", files=files, data=data, timeout=60)
    print("HTTP", r.status_code)
    payload = r.json()
    if payload.get("success"):
        print("OK -- processing_time_ms:", payload.get("processing_time_ms"))
        print("stages:", payload.get("stages"))
        print("region_count:", payload.get("region_count"))
        out_bytes = base64.b64decode(payload["translated_image"])
        with open("/tmp/test_panel_via_proxy.png", "wb") as f2:
            f2.write(out_bytes)
        print("Translated image saved -> /tmp/test_panel_via_proxy.png")
    else:
        print("FAILED:", payload.get("error"))
        sys.exit(1)

print("\n--- /api/options via proxy ---")
r = requests.get("http://localhost:3000/api/options", timeout=15)
print("HTTP", r.status_code, "keys:", list(r.json().keys())[:5])

print("\n--- /api/extension/assets ---")
r = requests.get("http://localhost:3000/api/extension/assets", timeout=15)
print("HTTP", r.status_code)
data = r.json()
for a in data.get("assets", []):
    print(f"  {a['name']:40s} {a['size']:>8d} B  -> {a['url']}")

print("\n--- /api/health ---")
r = requests.get("http://localhost:3000/api/health", timeout=15)
print("HTTP", r.status_code, "frontend:", r.json().get("frontend"))
