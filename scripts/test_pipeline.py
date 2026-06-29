"""Generate a synthetic manga-panel test image with English text in a bubble."""
from PIL import Image, ImageDraw, ImageFont
import base64, io, requests, sys

img = Image.new("RGB", (800, 600), (240, 240, 240))
draw = ImageDraw.Draw(img)

# Draw a "speech bubble"
draw.ellipse([60, 80, 460, 320], outline=(20, 20, 20), width=3, fill=(255, 255, 255))
draw.polygon([(180, 320), (220, 380), (260, 320)], fill=(255, 255, 255), outline=(20, 20, 20))

# Speech text
font = ImageFont.truetype("/home/z/my-project/mini-services/manga-api/fonts/comic shanns 2.ttf", 28)
draw.text((110, 140), "Hello world!", fill=(20, 20, 20), font=font)
draw.text((110, 190), "I am a hero.", fill=(20, 20, 20), font=font)

# Another bubble bottom right
draw.rounded_rectangle([500, 360, 760, 540], radius=20, outline=(20, 20, 20), width=3, fill=(255, 255, 255))
draw.text((520, 410), "Help me!", fill=(20, 20, 20), font=font)
draw.text((520, 460), "Save the city", fill=(20, 20, 20), font=font)

img.save("/tmp/test_panel.png")
print("Test image saved -> /tmp/test_panel.png")

# Send to API
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
    print("Calling /translate ...")
    r = requests.post("http://localhost:8000/translate", files=files, data=data, timeout=60)
    print("HTTP", r.status_code)
    payload = r.json()
    if payload.get("success"):
        print("OK -- processing_time_ms:", payload.get("processing_time_ms"))
        print("stages:", payload.get("stages"))
        print("region_count:", payload.get("region_count"))
        for reg in payload.get("regions", []):
            print(f"  region {reg['index']} bbox={reg['bbox']} src={reg['source_text']!r} -> tgt={reg['translated_text']!r}")
        out_bytes = base64.b64decode(payload["translated_image"])
        with open("/tmp/test_panel_translated.png", "wb") as f2:
            f2.write(out_bytes)
        print("Translated image saved -> /tmp/test_panel_translated.png")
    else:
        print("FAILED:", payload.get("error"))
        sys.exit(1)
