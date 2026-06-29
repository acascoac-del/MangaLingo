"""Generate a manga-style test panel with Japanese text in speech bubbles.
This will let us verify the real pipeline works on Japanese input."""
from PIL import Image, ImageDraw, ImageFont
import base64

# Use msgothic for Japanese
font_paths = [
    "/home/z/my-project/mini-services/manga-api/fonts/msgothic.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]

# Try to load a Japanese font
jp_font = None
for fp in font_paths:
    try:
        jp_font = ImageFont.truetype(fp, 28)
        print(f"Using font: {fp}")
        break
    except Exception as e:
        print(f"Failed: {fp} - {e}")

if jp_font is None:
    raise RuntimeError("No Japanese font found")

# Create a manga-style page (white background, B4 manga ratio)
W, H = 1200, 1600
img = Image.new("RGB", (W, H), (250, 250, 248))
draw = ImageDraw.Draw(img)

# Top-left panel: character with speech bubble
# Background gradient for "sky"
for y in range(0, 700):
    r = int(180 + (250-180) * y/700)
    g = int(200 + (250-200) * y/700)
    b = int(230 + (248-230) * y/700)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Bottom panels background
draw.rectangle([0, 700, W, H], fill=(245, 240, 230))

# Panel 1: Big speech bubble with Japanese text
draw.ellipse([180, 100, 720, 380], outline=(20, 20, 20), width=4, fill=(255, 255, 255))
# Tail
draw.polygon([(280, 360), (320, 460), (380, 380)], fill=(255, 255, 255), outline=(20, 20, 20))

# Japanese text in bubble
draw.text((240, 160), "おはよう！", fill=(20, 20, 20), font=jp_font)
draw.text((240, 210), "今日はいい天気だね", fill=(20, 20, 20), font=jp_font)
draw.text((240, 260), "学校に行こう", fill=(20, 20, 20), font=jp_font)

# Panel 2: Second speech bubble (bottom right)
draw.ellipse([700, 800, 1150, 1100], outline=(20, 20, 20), width=4, fill=(255, 255, 255))
draw.polygon([(820, 1080), (870, 1180), (920, 1100)], fill=(255, 255, 255), outline=(20, 20, 20))

draw.text((750, 870), "こんにちは！", fill=(20, 20, 20), font=jp_font)
draw.text((750, 920), "元気ですか？", fill=(20, 20, 20), font=jp_font)
draw.text((750, 970), "また会えて嬉しい", fill=(20, 20, 20), font=jp_font)

# Panel 3: Bottom caption box
draw.rounded_rectangle([80, 1300, 1120, 1500], radius=12, outline=(20, 20, 20), width=3, fill=(255, 255, 255))
draw.text((130, 1370), "それは遠い昔の話でした", fill=(20, 20, 20), font=jp_font)

# Save
out_path = "/tmp/test_manga_jp.png"
img.save(out_path)
print(f"Test manga saved -> {out_path}")
print(f"Size: {img.size}")

# Also save as base64 for the API test
import io
buf = io.BytesIO()
img.save(buf, format="PNG")
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
print(f"Base64 length: {len(b64)}")
