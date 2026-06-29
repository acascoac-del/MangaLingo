"""Pillow-based text renderer.

Renders translated text inside a detected bbox. Picks a font family from
the bundled fonts (see ../fonts/) and auto-sizes it so the text fits inside
the bbox without overflowing. Supports basic word-wrapping.

For CJK text we skip whitespace-based wrapping and let PIL wrap per glyph.
"""

from __future__ import annotations
import os
import textwrap
from dataclasses import dataclass
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

_FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"

_FONT_FILES = {
    "comic":       "comic shanns 2.ttf",
    "anime_ace":   "anime_ace.ttf",
    "anime_ace_3": "anime_ace_3.ttf",
    "msyh":        "msyh.ttc",
    "msgothic":    "msgothic.ttc",
}

# Languages whose scripts are written without inter-word spaces — wrap per glyph.
_GLYPH_LANGS = {"ja", "ko", "zh", "zh-CN", "zh-TW", "th"}


@dataclass
class PillowRenderer:
    """Render translated text on top of an inpainted region."""

    def render(self, pil_img: Image.Image, text: str, bbox: list[int],
               font_family: str = "comic", font_size: int = 0) -> Image.Image:
        if not text or not text.strip():
            return pil_img

        x1, y1, x2, y2 = bbox
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)

        draw = ImageDraw.Draw(pil_img)

        # Pick the best font file for the requested family.
        font_path = self._font_path(font_family)
        target_lang = getattr(self, "_target_lang", None) or ""

        # Auto-fit the font size: start from the height and shrink until the
        # wrapped text fits inside the bbox.
        font = self._fit_font(font_path, text, box_w, box_h,
                              is_glyph=target_lang in _GLYPH_LANGS)
        if font is None:
            return pil_img

        # Compute wrapped lines.
        lines = self._wrap_text(text, font, box_w,
                                is_glyph=target_lang in _GLYPH_LANGS)
        if not lines:
            return pil_img

        # Vertical centering.
        line_spacing = 1.15
        line_h = int(font.size * line_spacing)
        total_h = line_h * len(lines)
        cy = y1 + max(0, (box_h - total_h) // 2)

        for ln in lines:
            tw = draw.textlength(ln, font=font)
            cx = x1 + max(0, (box_w - tw) // 2)
            # Draw a subtle dark outline so the text remains readable against
            # any background bleed-through.
            for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                draw.text((cx + ox, cy + oy), ln, fill=(0, 0, 0), font=font)
            draw.text((cx, cy), ln, fill=(20, 20, 20), font=font)
            cy += line_h

        return pil_img

    @staticmethod
    def _font_path(family: str) -> str:
        fname = _FONT_FILES.get(family) or _FONT_FILES["comic"]
        path = _FONTS_DIR / fname
        if not path.exists():
            # Final fallback to a built-in PIL font.
            return ""
        return str(path)

    @staticmethod
    def _fit_font(font_path: str, text: str, box_w: int, box_h: int,
                  is_glyph: bool = False):
        if not font_path:
            return ImageFont.load_default()
        # Start from a size that roughly fills the box height, then shrink.
        max_size = max(8, int(box_h * 0.95))
        for size in range(max_size, 7, -1):
            try:
                font = ImageFont.truetype(font_path, size)
            except Exception:
                return ImageFont.load_default()
            lines = PillowRenderer._wrap_text(text, font, box_w, is_glyph=is_glyph)
            if not lines:
                continue
            line_h = int(size * 1.15)
            if line_h * len(lines) <= box_h * 0.95:
                return font
        try:
            return ImageFont.truetype(font_path, 8)
        except Exception:
            return ImageFont.load_default()

    @staticmethod
    def _wrap_text(text: str, font: ImageFont.FreeTypeFont, box_w: int,
                   is_glyph: bool = False) -> list[str]:
        text = text.strip()
        if not text:
            return []
        if is_glyph:
            # Wrap per glyph, respecting existing newlines.
            out: list[str] = []
            for paragraph in text.split("\n"):
                line = ""
                for ch in paragraph:
                    if ch == " ":
                        continue
                    candidate = line + ch
                    if font.getlength(candidate) > box_w and line:
                        out.append(line)
                        line = ch
                    else:
                        line = candidate
                if line:
                    out.append(line)
            return out

        out: list[str] = []
        for paragraph in text.split("\n"):
            if not paragraph.strip():
                out.append("")
                continue
            # Estimate chars-per-line from average glyph width.
            avg = font.getlength("a") or 1
            cpl = max(1, int(box_w / avg))
            wrapped = textwrap.wrap(paragraph, width=cpl) or [paragraph]
            out.extend(wrapped)
        return out
