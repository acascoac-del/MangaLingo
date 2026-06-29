from __future__ import annotations
import asyncio
import sys
import os
import logging

log = logging.getLogger("manga-lite-bridge")

_lite_translator = None


def get_lite_translator():
    global _lite_translator
    if _lite_translator is None:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "manga-translator-lite"))
        from manga_translator_lite import MangaTranslator
        _lite_translator = MangaTranslator(
            translator="llama",
            n_threads=int(os.getenv("LITE_N_THREADS", "8")),
        )
        log.info("Manga Translator Lite loaded")
    return _lite_translator


async def translate_with_lite(
    image_b64: str,
    target_lang: str = "es",
    source_lang: str = "auto",
) -> dict:
    import base64
    import io
    from PIL import Image

    try:
        img_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(img_bytes))
    except Exception as e:
        return {"success": False, "error": f"Invalid image: {e}"}

    def _run():
        translator = get_lite_translator()
        return translator.translate(image, target_lang=target_lang, source_lang=source_lang)

    result = await asyncio.to_thread(_run)

    import io as _io
    buf = _io.BytesIO()
    result.image.save(buf, format="PNG")
    translated_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "success": result.success,
        "translated_image": translated_b64,
        "processing_time_ms": result.processing_time_ms,
        "region_count": len(result.regions),
        "backend_used": result.backend_used,
        "regions": [
            {
                "bbox": [r.bbox.x1, r.bbox.y1, r.bbox.x2, r.bbox.y2],
                "source_text": r.text,
                "translated_text": r.translation,
                "confidence": r.confidence,
            }
            for r in result.regions
        ],
    }
