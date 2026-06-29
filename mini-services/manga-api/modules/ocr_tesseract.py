"""Tesseract OCR bridge.

Uses the system `tesseract` binary via pytesseract. For Japanese / Korean /
Chinese source material you can pass `lang_hint='ja'|'ko'|'zh'` and we will
pick the matching Tesseract language pack when available.

If the requested language pack is missing we transparently fall back to
English so the pipeline never hard-fails.
"""

from __future__ import annotations
import shutil
from dataclasses import dataclass
import cv2
import numpy as np
import pytesseract


_TESS_AVAIL: set[str] | None = None


def _available_tess_langs() -> set[str]:
    global _TESS_AVAIL
    if _TESS_AVAIL is None:
        try:
            _TESS_AVAIL = set(pytesseract.get_languages(config=""))
        except Exception:
            _TESS_AVAIL = {"eng"}
    return _TESS_AVAIL


_HINT_TO_TESS = {
    "auto": None,    # let tesseract detect
    "en": "eng",
    "es": "spa",
    "fr": "fra",
    "de": "deu",
    "it": "ita",
    "pt": "por",
    "pt-BR": "por",
    "ru": "rus",
    "ja": "jpn",
    "ko": "kor",
    "zh": "chi_sim",
    "zh-CN": "chi_sim",
    "zh-TW": "chi_tra",
    "ar": "ara",
    "nl": "nld",
    "pl": "pol",
    "tr": "tur",
    "id": "ind",
    "vi": "vie",
    "th": "tha",
    "hi": "hin",
}


@dataclass
class TesseractOCR:
    """Run Tesseract on a BGR crop and return (text, confidence)."""

    psm: int = 6  # Assume a uniform block of text by default

    def recognize(self, crop_bgr: np.ndarray, lang_hint: str = "auto") -> tuple[str, float]:
        if crop_bgr is None or crop_bgr.size == 0:
            return "", 0.0

        if not shutil.which("tesseract"):
            return "", 0.0

        # Pre-process: scale up tiny text, grayscale, threshold.
        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        if max(h, w) < 64:
            scale = 64 / max(h, w)
            gray = cv2.resize(gray, None, fx=scale, fy=scale,
                              interpolation=cv2.INTER_CUBIC)
        # Adaptive threshold works better than OTSU on bubble interiors.
        binar = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10,
        )

        # Pick the Tesseract language pack.
        avail = _available_tess_langs()
        hint = _HINT_TO_TESS.get((lang_hint or "auto"), None)
        tess_lang = "eng"
        if hint and hint in avail:
            tess_lang = hint
        elif lang_hint == "auto":
            # Try Japanese first (most common source for manga), then English.
            for cand in ("jpn", "eng"):
                if cand in avail:
                    tess_lang = cand
                    break

        config = f"--psm {self.psm} -l {tess_lang}"
        try:
            data = pytesseract.image_to_data(
                binar, config=config, output_type=pytesseract.Output.DICT,
            )
        except Exception:
            try:
                txt = pytesseract.image_to_string(binar, config=config).strip()
                return txt, 0.5
            except Exception:
                return "", 0.0

        words = []
        confs = []
        for word, conf in zip(data.get("text", []), data.get("conf", [])):
            if not word or not word.strip():
                continue
            try:
                c = float(conf)
            except (TypeError, ValueError):
                c = -1.0
            if c < 0:
                continue
            words.append(word.strip())
            confs.append(c)
        text = " ".join(words).strip()
        avg_conf = (sum(confs) / len(confs)) if confs else 0.0
        avg_conf = avg_conf / 100.0 if avg_conf > 1.0 else avg_conf
        return text, float(avg_conf)
