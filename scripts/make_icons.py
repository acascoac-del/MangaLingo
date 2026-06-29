"""Generate PNG icons for the Chrome extension using Pillow."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path("/home/z/my-project/extension-src/icons")
OUT.mkdir(parents=True, exist_ok=True)

def make_icon(size: int):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Rounded background gradient (simulate with two layered ellipses)
    pad = max(1, size // 16)
    # Background
    d.rounded_rectangle([pad, pad, size - pad, size - pad],
                        radius=max(2, size // 6),
                        fill=(217, 70, 239, 255))  # fuchsia
    # Inner highlight
    d.rounded_rectangle([pad + size // 16, pad + size // 16,
                          size - pad - size // 16, size - pad - size // 16],
                        radius=max(2, size // 8),
                        fill=(245, 158, 11, 255))  # amber
    # "M" letter
    try:
        font = ImageFont.truetype(
            "/home/z/my-project/mini-services/manga-api/fonts/anime_ace.ttf",
            int(size * 0.55),
        )
    except Exception:
        font = ImageFont.load_default()
    text = "M"
    tw = d.textlength(text, font=font)
    try:
        bbox = font.getbbox(text)
        th = bbox[3] - bbox[1]
    except Exception:
        th = int(size * 0.55)
    d.text(((size - tw) / 2, (size - th) / 2 - size * 0.05),
           text, fill=(255, 255, 255, 255), font=font)
    img.save(OUT / f"icon{size}.png")
    print(f"  -> icon{size}.png")

for s in (16, 32, 48, 128):
    make_icon(s)

print("OK")
