from __future__ import annotations
import asyncio
import base64
import hashlib
import io
import logging
import os
import gc
import sys
import time
import traceback
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image

from manga_translator import Config
from manga_translator.config import (
    Detector, Ocr, Translator, Inpainter, Renderer as MTRenderer,
)
from manga_translator.manga_translator import MangaTranslator
from manga_translator.utils import Context

log = logging.getLogger("manga-pipeline")
log.setLevel(logging.INFO)

DETECTOR_MAP = {
    "default": Detector.default, "dbconvnext": Detector.dbconvnext,
    "ctd": Detector.ctd, "craft": Detector.craft, "none": Detector.none,
}
OCR_MAP = {
    "48px": Ocr.ocr48px, "32px": Ocr.ocr32px, "48px_ctc": Ocr.ocr48px_ctc,
    "manga_ocr": Ocr.mocr, "mocr": Ocr.mocr,
}

TRANSLATOR_MAP = {
    "groq": Translator.groq,
    "xiaomi": Translator.mimo_token_plan_v25,
    "xiaomi_pro": Translator.mimo_token_plan,
    "ollama": Translator.custom_openai,
    "google": Translator.google,
    "lite": "lite",
}

MIMO_TRANSLATORS = {"xiaomi", "xiaomi_pro", "mimo", "mimo_token_plan", "mimo_token_plan_v25", "mimo_v25"}

PIPELINE_CONCURRENCY = int(os.getenv("PIPELINE_CONCURRENCY", "20"))
STREAM_CONCURRENCY = int(os.getenv("STREAM_CONCURRENCY", "4"))
_pipeline_sem = asyncio.Semaphore(PIPELINE_CONCURRENCY)

MODELS_TTL = int(os.getenv("MODELS_TTL", "600"))
VRAM_CLEANUP_EVERY = int(os.getenv("VRAM_CLEANUP_EVERY", "8"))

TRANSLATOR_OPTIONS = [
    {"key": "groq", "name": "Groq (cloud, rapido)", "heavy": False, "needs_key": True, "key_env": "GROQ_API_KEY"},
    {"key": "xiaomi", "name": "Xiaomi MiMo", "heavy": False, "needs_key": True,
     "key_env": "MIMO_TOKEN_PLAN_API_KEY (formato tp-xxxxx)"},
    {"key": "google", "name": "Google Translate (online, gratis)", "heavy": False, "needs_key": False},
]

INPAINTER_MAP = {
    "default": Inpainter.default, "lama_large": Inpainter.lama_large,
    "lama_mpe": Inpainter.lama_mpe, "lama": Inpainter.lama_large,
    "sd": Inpainter.sd, "none": Inpainter.none, "original": Inpainter.original,
    "solid": Inpainter.solid,
}
RENDERER_MAP = {
    "default": MTRenderer.default, "manga2eng": MTRenderer.manga2Eng,
    "manga2eng_pillow": MTRenderer.manga2EngPillow, "pillow": MTRenderer.manga2EngPillow,
    "gimp": MTRenderer.default, "none": MTRenderer.none,
}
LANG_MAP = {
    "auto": "auto", "es": "ESP", "en": "ENG", "fr": "FRA", "de": "DEU",
    "it": "ITA", "pt": "PTB", "pt-BR": "PTB", "ru": "RUS", "ja": "JPN",
    "ko": "KOR", "zh": "CHS", "zh-CN": "CHS", "zh-TW": "CHT",
    "ar": "ARA", "nl": "NLD", "pl": "POL", "tr": "TRK",
    "id": "IND", "vi": "VIN", "th": "THA", "hi": "HIN",
}
FONT_FILES = {
    "comic": "comic shanns 2.ttf", "anime_ace": "anime_ace.ttf",
    "anime_ace_3": "anime_ace_3.ttf", "msyh": "msyh.ttc",
    "msgothic": "msgothic.ttc", "arial": "Arial-Unicode-Regular.ttf",
}


def _detect_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            log.info(f"GPU detectada: {gpu_name} ({vram:.1f} GB VRAM)")
            return "cuda"
        log.warning("CUDA no disponible. Usando CPU.")
        return "cpu"
    except Exception as e:
        log.warning(f"GPU no detectada: {e}. CPU.")
        return "cpu"


DEVICE = _detect_device()

LEGACY_LOCAL_TRANSLATORS = {
    "qwen", "qwen2", "qwen2_big", "nllb", "nllb_big",
    "offline", "local", "m2m100", "m2m100_big", "mbart50", "sugoi",
    "jparacrawl", "jparacrawl_big",
}


def resolve_translator(name: str) -> str:
    n = (name or "").strip().lower()
    if n in ("", "auto", "default"):
        return "groq"
    if n in LEGACY_LOCAL_TRANSLATORS:
        log.warning("Traductor local/legacy '%s' solicitado; usando Groq.", n)
        return "groq"
    if n in ("mimo", "mimo_token_plan_v25", "mimo_v25"):
        return "xiaomi"
    if n == "mimo_token_plan":
        return "xiaomi_pro"
    if n in ("custom_openai", "openai_compatible"):
        return "ollama"
    return n


class TranslationCache:
    def __init__(self, max_size: int = 1024):
        self.max_size = max_size
        self._cache: OrderedDict[str, dict] = OrderedDict()
        self._lock = asyncio.Lock()

    def _key(self, b64: str, lang: str, trans: str) -> str:
        h = hashlib.sha256(b64.encode("ascii", errors="ignore"))
        h.update(lang.encode())
        h.update(trans.encode())
        return h.hexdigest()

    async def get(self, b64, lang, trans):
        k = self._key(b64, lang, trans)
        async with self._lock:
            if k in self._cache:
                self._cache.move_to_end(k)
                return self._cache[k]
            return None

    async def put(self, b64, lang, trans, result):
        k = self._key(b64, lang, trans)
        async with self._lock:
            if k in self._cache:
                self._cache.move_to_end(k)
            self._cache[k] = result
            while len(self._cache) > self.max_size:
                self._cache.popitem(last=False)

    async def clear(self):
        async with self._lock:
            self._cache.clear()


CACHE_SIZE = int(os.getenv("TRANSLATION_CACHE_SIZE", "1024"))
_cache = TranslationCache(max_size=CACHE_SIZE)
_cleanup_counter = 0
_cleanup_lock = asyncio.Lock()


@dataclass
class Region:
    index: int
    bbox: list[int]
    polygon: list[list[int]]
    source_text: str = ""
    translated_text: str = ""
    confidence: float = 0.0
    inpainted: bool = False
    rendered: bool = False


@dataclass
class PipelineResult:
    success: bool
    original_b64: str = ""
    translated_b64: str = ""
    regions: list[dict] = field(default_factory=list)
    processing_time_ms: int = 0
    stages: dict = field(default_factory=dict)
    error: Optional[str] = None
    backend_used: dict = field(default_factory=dict)
    cache_hit: bool = False


def _pil_to_b64(img, fmt="PNG", quality=90):
    buf = io.BytesIO()
    save_kwargs = {"format": fmt}
    if fmt.upper() in ("JPEG", "JPG"):
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True
        if img.mode == "RGBA":
            img = img.convert("RGB")
    img.save(buf, **save_kwargs)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _b64_to_pil(b64):
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def _resolve_font_path(family):
    fname = FONT_FILES.get(family) or FONT_FILES["anime_ace_3"]
    for p in [os.path.join(os.path.dirname(__file__), "fonts", fname),
              os.path.join(os.path.dirname(__file__), "manga_translator", "fonts", fname)]:
        if os.path.exists(p):
            return p
    return None


_mt_instance = None
_mt_lock = asyncio.Lock()


async def _get_mt():
    global _mt_instance
    if _mt_instance is None:
        async with _mt_lock:
            if _mt_instance is None:
                log.info(f"Inicializando MangaTranslator (device={DEVICE}, ttl={MODELS_TTL}s)...")
                _mt_instance = MangaTranslator({
                    "device": DEVICE, "verbose": False, "ignore_errors": False,
                    "models_ttl": MODELS_TTL, "batch_size": 4, "kernel_size": 3,
                    "mask_dilation_offset": 20, "font_path": None,
                })
                log.info("MangaTranslator listo.")
    return _mt_instance


def _build_config(target_lang, source_lang, detector, ocr, translator,
                  inpainter, renderer, font_family, font_size,
                  mimo_token=None, mimo_model=None, groq_key=None,
                  groq_model=None, ollama_model=None):
    resolved = resolve_translator(translator)
    tgt = LANG_MAP.get(target_lang, "ESP")
    tra_enum = TRANSLATOR_MAP.get(resolved)
    if tra_enum is None:
        raise ValueError(f"Traductor no soportado: {translator}. Opciones: {[t['key'] for t in TRANSLATOR_OPTIONS]}")

    cfg = Config()
    cfg.detector.detector = DETECTOR_MAP.get(detector, Detector.default)
    cfg.ocr.ocr = OCR_MAP.get(ocr, Ocr.mocr)
    cfg.translator.translator = tra_enum
    cfg.translator.target_lang = tgt
    cfg.inpainter.inpainter = INPAINTER_MAP.get(inpainter, Inpainter.lama_large)
    cfg.render.renderer = RENDERER_MAP.get(renderer, MTRenderer.default)

    # Translator is always cloud API.
    cfg.detector.detection_size = 768
    cfg.inpainter.inpainting_size = 640

    if DEVICE == "cuda":
        try:
            from manga_translator.config import InpaintPrecision
            cfg.inpainter.inpainting_precision = InpaintPrecision.fp16
        except Exception:
            pass

    cfg.translator.enable_post_translation_check = False
    cfg.translator.no_text_lang_skip = True

    if mimo_token:
        cfg.translator.mimo_token = mimo_token
    if mimo_model:
        cfg.translator.mimo_model = mimo_model
    if groq_key:
        cfg.translator.groq_key = groq_key
    if groq_model:
        cfg.translator.groq_model = groq_model
    if ollama_model:
        cfg.translator.ollama_model = ollama_model

    font_path = _resolve_font_path(font_family)
    if font_path:
        cfg._font_path = font_path
    if font_size and font_size > 0:
        cfg.render.font_size = font_size
    return cfg


async def _maybe_cleanup_vram(force: bool = False):
    global _cleanup_counter
    if DEVICE != "cuda":
        return
    async with _cleanup_lock:
        _cleanup_counter += 1
        if force or _cleanup_counter >= VRAM_CLEANUP_EVERY:
            _cleanup_counter = 0
            try:
                import torch
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
            except Exception:
                pass


async def _run_pipeline_inner(image_b64, target_lang="es", source_lang="auto",
                              detector="ctd", ocr="manga_ocr", translator="groq",
                              inpainter="lama", renderer="manga2eng",
                              font_family="comic", font_size=0,
                              mimo_token=None, mimo_model=None, groq_key=None,
                              groq_model=None, ollama_model=None):
    start = time.time()
    resolved_translator = resolve_translator(translator)
    backend_used = {
        "detector": detector, "ocr": ocr, "translator": resolved_translator,
        "requested_translator": translator,
        "inpainter": inpainter, "renderer": renderer,
        "target_lang": target_lang, "source_lang": source_lang,
        "device": DEVICE, "pipeline_version": "1.16.0",
    }

    try:
        pil_img = _b64_to_pil(image_b64).convert("RGB")
        original_b64 = _pil_to_b64(pil_img, "JPEG", quality=85)

        cached = await _cache.get(image_b64, target_lang, resolved_translator)
        if cached:
            total = int((time.time() - start) * 1000)
            return PipelineResult(
                success=True, original_b64=original_b64,
                translated_b64=cached["translated_b64"], regions=cached.get("regions", []),
                processing_time_ms=total, backend_used={**backend_used, "cache_hit": True},
                cache_hit=True)

        cfg = _build_config(
            target_lang, source_lang, detector, ocr, translator,
            inpainter, renderer, font_family, font_size,
            mimo_token=mimo_token, mimo_model=mimo_model, groq_key=groq_key,
            groq_model=groq_model, ollama_model=ollama_model,
        )
        mt = await _get_mt()

        log.info(
            f"Pipeline v1.16.0: det={detector} ocr={ocr} tra={translator}"
            f"->{resolved_translator} inp={inpainter} tgt={target_lang} dev={DEVICE}"
        )

        ctx: Context = await mt.translate(pil_img, cfg)
        if ctx.result is None:
            raise RuntimeError("Pipeline produjo una imagen de resultado nula")

        translated_b64 = _pil_to_b64(ctx.result, "JPEG", quality=90)

        regions_out = []
        if hasattr(ctx, "text_regions") and ctx.text_regions:
            for i, tb in enumerate(ctx.text_regions):
                xyxy = tb.xyxy if hasattr(tb, "xyxy") else [0, 0, 0, 0]
                bbox = [int(v) for v in xyxy]
                poly = []
                if hasattr(tb, "polygon") and tb.polygon is not None:
                    try:
                        poly = [[int(p[0]), int(p[1])] for p in tb.polygon]
                    except Exception:
                        pass
                src = (tb.text or "").strip() if hasattr(tb, "text") else ""
                tgt = (tb.translation or "").strip() if hasattr(tb, "translation") else ""
                regions_out.append({
                    "index": i, "bbox": bbox, "polygon": poly,
                    "source_text": src, "translated_text": tgt,
                    "confidence": float(getattr(tb, "prob", 0.0) or 0.0),
                    "inpainted": True, "rendered": True,
                })

        await _cache.put(image_b64, target_lang, resolved_translator, {
            "translated_b64": translated_b64, "regions": regions_out,
        })

        await _maybe_cleanup_vram()

        total = int((time.time() - start) * 1000)
        log.info(f"Pipeline OK en {total}ms (device={DEVICE}, translator={resolved_translator})")

        return PipelineResult(
            success=True, original_b64=original_b64,
            translated_b64=translated_b64, regions=regions_out,
            processing_time_ms=total, backend_used=backend_used)

    except Exception as exc:
        log.error(f"Pipeline falló: {exc}\n{traceback.format_exc()}")
        total = int((time.time() - start) * 1000)
        return PipelineResult(
            success=False, processing_time_ms=total,
            error=f"{type(exc).__name__}: {exc}", backend_used=backend_used)


async def run_pipeline(image_b64, target_lang="es", source_lang="auto",
                       detector="ctd", ocr="manga_ocr", translator="groq",
                       inpainter="lama", renderer="manga2eng",
                       font_family="comic", font_size=0,
                       mimo_token=None, mimo_model=None, groq_key=None,
                       groq_model=None, ollama_model=None):
    async with _pipeline_sem:
        return await _run_pipeline_inner(
            image_b64, target_lang, source_lang, detector, ocr, translator,
            inpainter, renderer, font_family, font_size,
            mimo_token, mimo_model, groq_key, groq_model, ollama_model,
        )


async def run_pipeline_batch(
    images_b64: list[str],
    target_lang="es", source_lang="auto",
    detector="ctd", ocr="manga_ocr", translator="groq",
    inpainter="lama", renderer="manga2eng",
    font_family="comic", font_size=0,
    mimo_token=None, mimo_model=None, groq_key=None,
    groq_model=None, ollama_model=None,
) -> dict:
    batch_start = time.time()
    resolved_translator = resolve_translator(translator)

    async def process_one(index: int, b64: str) -> dict:
        result = await run_pipeline(
            b64, target_lang, source_lang, detector, ocr, translator,
            inpainter, renderer, font_family, font_size,
            mimo_token, mimo_model, groq_key, groq_model, ollama_model,
        )
        item = {
            "index": index,
            "success": result.success,
            "processing_time_ms": result.processing_time_ms,
            "cache_hit": result.cache_hit,
        }
        if result.success:
            item["translated_image"] = result.translated_b64
            item["region_count"] = len(result.regions)
        else:
            item["error"] = result.error
        return item

    tasks = [process_one(i, b64) for i, b64 in enumerate(images_b64)]
    results = await asyncio.gather(*tasks)
    total_ms = int((time.time() - batch_start) * 1000)
    ok = sum(1 for r in results if r["success"])

    log.info(f"Batch OK: {ok}/{len(images_b64)} imagenes en {total_ms}ms "
             f"(concurrencia={PIPELINE_CONCURRENCY}, translator={resolved_translator})")

    return {
        "success": ok > 0,
        "total": len(images_b64),
        "succeeded": ok,
        "failed": len(images_b64) - ok,
        "processing_time_ms": total_ms,
        "results": results,
        "backend_used": {
            "translator": resolved_translator, "device": DEVICE,
            "pipeline_version": "1.16.0",
            "concurrency": PIPELINE_CONCURRENCY,
        },
    }


async def run_pipeline_batch_stream(
    images_b64: list[str],
    target_lang="es", source_lang="auto",
    detector="ctd", ocr="manga_ocr", translator="groq",
    inpainter="lama", renderer="manga2eng",
    font_family="comic", font_size=0,
    mimo_token=None, mimo_model=None, groq_key=None,
    groq_model=None, ollama_model=None,
):
    batch_start = time.time()
    resolved_translator = resolve_translator(translator)
    total = len(images_b64)
    ok = 0
    stream_sem = asyncio.Semaphore(STREAM_CONCURRENCY)

    async def process_one(index: int, b64: str) -> dict:
        async with stream_sem:
            result = await run_pipeline(
                b64, target_lang, source_lang, detector, ocr, translator,
                inpainter, renderer, font_family, font_size,
                mimo_token, mimo_model, groq_key, groq_model, ollama_model,
            )
        item = {
            "index": index,
            "success": result.success,
            "processing_time_ms": result.processing_time_ms,
            "cache_hit": result.cache_hit,
        }
        if result.success:
            item["translated_image"] = result.translated_b64
            item["region_count"] = len(result.regions)
        else:
            item["error"] = result.error
        return item

    tasks = [asyncio.create_task(process_one(i, b64)) for i, b64 in enumerate(images_b64)]

    done_count = 0
    for coro in asyncio.as_completed(tasks):
        result = await coro
        done_count += 1
        if result["success"]:
            ok += 1
        yield {
            "type": "progress",
            "index": result["index"],
            "done": done_count,
            "total": total,
            "success": result["success"],
            "processing_time_ms": result["processing_time_ms"],
            "cache_hit": result["cache_hit"],
            "translated_image": result.get("translated_image"),
            "region_count": result.get("region_count"),
            "error": result.get("error"),
        }

    total_ms = int((time.time() - batch_start) * 1000)
    log.info(f"Batch stream OK: {ok}/{total} imagenes en {total_ms}ms "
             f"(concurrencia={PIPELINE_CONCURRENCY}, translator={resolved_translator})")

    yield {
        "type": "complete",
        "success": ok > 0,
        "total": total,
        "succeeded": ok,
        "failed": total - ok,
        "processing_time_ms": total_ms,
        "backend_used": {
            "translator": resolved_translator, "device": DEVICE,
            "pipeline_version": "1.16.0",
            "concurrency": PIPELINE_CONCURRENCY,
        },
    }


def clear_cache():
    _cache._cache.clear()


async def get_cache_stats() -> dict:
    return {
        "size": len(_cache._cache),
        "max_size": _cache.max_size,
        "device": DEVICE,
        "concurrency": PIPELINE_CONCURRENCY,
        "models_ttl": MODELS_TTL,
    }
