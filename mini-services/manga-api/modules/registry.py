"""Module registry — declares all available detection/OCR/inpaint/translate/render backends.

Lightweight backends are always available. Heavy ML backends from `detection.zip`
are listed here as documentation; they require GPU + model weights to instantiate,
so they fall back automatically when the imports fail.
"""

from __future__ import annotations
import importlib
from typing import Type

# ---------- Always-available lightweight backends ----------
from .detection_opencv import OpenCVDetector
from .ocr_tesseract import TesseractOCR
from .inpaint_opencv import OpenCVInpainter
from .translator import GroqTranslatorBridge, XiaomiTranslatorBridge, OllamaTranslatorBridge
from .renderer_pillow import PillowRenderer


def _try_import(path: str, attr: str):
    try:
        mod = importlib.import_module(path, package=__name__)
        return getattr(mod, attr, None)
    except Exception:
        return None


# ---------- Detection ----------
DefaultDetector  = _try_import("detection.default",   "DefaultDetector")
DBConvNextDetector = _try_import("detection.dbnet_convnext", "DBConvNextDetector")
ComicTextDetector  = _try_import("detection.ctd",     "ComicTextDetector")
CRAFTDetector      = _try_import("detection.craft",   "CRAFTDetector")

# ---------- OCR ----------
MangaOCR       = _try_import("ocr.model_manga_ocr",   "MangaOcr")
Model48pxCTC   = _try_import("ocr.model_48px_ctc",    "Model48pxCTC")
Model48px      = _try_import("ocr.model_48px",        "Model48px")
Model32px      = _try_import("ocr.model_32px",        "Model32px")

# ---------- Inpainting ----------
LamaInpainter  = _try_import("inpainting.inpainting_lama", "LamaInpainter")
SDInpainter    = _try_import("inpainting.inpainting_sd",   "SDInpainter")
AOTInpainter   = _try_import("inpainting.inpainting_aot",  "AOTInpainter")
AttnInpainter  = _try_import("inpainting.inpainting_attn", "AttnInpainter")

# ---------- Renderers ----------
GimpRenderer   = _try_import("rendering.gimp_render",  "GimpRender")
TextRenderEng  = _try_import("rendering.text_render_eng", "TextRenderENG")


DETECTORS: dict[str, Type] = {
    "opencv": OpenCVDetector,
    "default": DefaultDetector or OpenCVDetector,
    "dbnet_convnext": DBConvNextDetector or OpenCVDetector,
    "ctd": ComicTextDetector or OpenCVDetector,
    "craft": CRAFTDetector or OpenCVDetector,
}

OCRS: dict[str, Type] = {
    "tesseract": TesseractOCR,
    "manga_ocr": MangaOCR or TesseractOCR,
    "48px_ctc":  Model48pxCTC or TesseractOCR,
    "48px":      Model48px or TesseractOCR,
    "32px":      Model32px or TesseractOCR,
}

INPAINTERS: dict[str, Type] = {
    "opencv": OpenCVInpainter,
    "lama": LamaInpainter or OpenCVInpainter,
    "sd":   SDInpainter or OpenCVInpainter,
    "aot":  AOTInpainter or OpenCVInpainter,
    "attn": AttnInpainter or OpenCVInpainter,
}

TRANSLATORS: dict[str, Type] = {
    "groq": GroqTranslatorBridge,
    "xiaomi": XiaomiTranslatorBridge,
    "ollama": OllamaTranslatorBridge,
}

RENDERERS: dict[str, Type] = {
    "pillow":  PillowRenderer,
    "gimp":    GimpRenderer or PillowRenderer,
    "text_eng": TextRenderEng or PillowRenderer,
}


# ---------- Languages ----------
# Map our short codes -> deep-translator source/target codes where applicable.
LANGUAGES: dict[str, str] = {
    "auto": "auto",
    "es": "spanish",
    "en": "english",
    "fr": "french",
    "de": "german",
    "it": "italian",
    "pt": "portuguese",
    "pt-BR": "portuguese",
    "ru": "russian",
    "ja": "japanese",
    "ko": "korean",
    "zh": "chinese",
    "zh-CN": "chinese (simplified)",
    "zh-TW": "chinese (traditional)",
    "ar": "arabic",
    "nl": "dutch",
    "pl": "polish",
    "tr": "turkish",
    "id": "indonesian",
    "vi": "vietnamese",
    "th": "thai",
    "hi": "hindi",
}


FONT_FAMILIES: list[str] = [
    "comic",          # Comic Shanns 2 (latin)
    "anime_ace",      # Anime Ace (latin, comic-style)
    "anime_ace_3",    # Anime Ace 3
    "msyh",           # Microsoft YaHei (CJK)
    "msgothic",       # MS Gothic (CJK)
]
