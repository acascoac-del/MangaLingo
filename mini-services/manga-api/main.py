from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import sys
import time
import uuid
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image

from pipeline import (
    run_pipeline, run_pipeline_batch, run_pipeline_batch_stream,
    clear_cache, get_cache_stats,
    DETECTOR_MAP, OCR_MAP, TRANSLATOR_MAP,
    TRANSLATOR_OPTIONS, MIMO_TRANSLATORS, PIPELINE_CONCURRENCY,
    INPAINTER_MAP, RENDERER_MAP, LANG_MAP, FONT_FILES, DEVICE,
    resolve_translator,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("manga-api")

app = FastAPI(title="MangaLingo API", version="1.16.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    t0 = time.perf_counter()
    rid = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    response = await call_next(request)
    elapsed = (time.perf_counter() - t0) * 1000
    response.headers["x-process-time"] = f"{elapsed:.1f}"
    response.headers["x-request-id"] = rid
    return response


VALID_TRANSLATOR_KEYS = {t["key"] for t in TRANSLATOR_OPTIONS}


def _verify_image_b64(b64: str) -> None:
    Image.open(io.BytesIO(base64.b64decode(b64))).verify()


def _clean_b64(b64: str) -> str:
    if isinstance(b64, str) and "," in b64 and b64.startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _get_params(body: dict, prefix: str = "") -> dict:
    return {
        "target_lang": body.get(f"{prefix}target_lang", "es"),
        "source_lang": body.get(f"{prefix}source_lang", "auto"),
        "detector": body.get(f"{prefix}detector", "ctd"),
        "ocr": body.get(f"{prefix}ocr", "manga_ocr"),
        "translator": body.get(f"{prefix}translator", "groq"),
        "inpainter": body.get(f"{prefix}inpainter", "lama"),
        "renderer": body.get(f"{prefix}renderer", "manga2eng"),
        "font_family": body.get(f"{prefix}font_family", "anime_ace_3"),
        "font_size": int(body.get(f"{prefix}font_size", 0)),
        "return_metadata": bool(body.get(f"{prefix}return_metadata", True)),
        "mimo_token": body.get(f"{prefix}mimo_token"),
        "mimo_model": body.get(f"{prefix}mimo_model"),
        "groq_key": body.get(f"{prefix}groq_key"),
        "groq_model": body.get(f"{prefix}groq_model"),
        "ollama_model": body.get(f"{prefix}ollama_model"),
    }


def _validate_params(params: dict, endpoint: str = "translate"):
    trans = params.get("translator", "groq")
    resolved = resolve_translator(trans)
    if resolved not in TRANSLATOR_MAP:
        raise HTTPException(400, f"Traductor no soportado: {trans}. Opciones: {VALID_TRANSLATOR_KEYS}")
    mt = params.get("mimo_token")
    if resolved in MIMO_TRANSLATORS and not mt and not os.getenv("MIMO_TOKEN_PLAN_API_KEY"):
        raise HTTPException(400, "MiMo Token Plan requiere mimo_token (formato tp-xxxxx) o MIMO_TOKEN_PLAN_API_KEY.")


async def _run_single(b64: str, params: dict):
    try:
        await asyncio.to_thread(_verify_image_b64, b64)
    except Exception as exc:
        raise HTTPException(400, f"Imagen invalida: {exc}")

    _validate_params(params)
    resolved = resolve_translator(params["translator"])

    try:
        result = await run_pipeline(
            b64, params["target_lang"], params["source_lang"],
            params["detector"], params["ocr"], resolved,
            params["inpainter"], params["renderer"],
            params["font_family"], params["font_size"],
            mimo_token=params.get("mimo_token"),
            mimo_model=params.get("mimo_model"),
            groq_key=params.get("groq_key"),
            groq_model=params.get("groq_model"),
            ollama_model=params.get("ollama_model"),
        )
    except Exception as exc:
        log.error(f"Pipeline executor crashed: {exc}")
        return JSONResponse(status_code=500, content={
            "success": False, "error": f"{type(exc).__name__}: {exc}",
        })

    if not result.success:
        return JSONResponse(status_code=500, content={
            "success": False, "error": result.error,
            "processing_time_ms": result.processing_time_ms,
            "backend_used": result.backend_used,
        })

    body = {
        "success": True,
        "translated_image": result.translated_b64,
        "processing_time_ms": result.processing_time_ms,
        "region_count": len(result.regions),
        "backend_used": result.backend_used,
    }
    if params.get("return_metadata", True):
        body["original_image"] = result.original_b64
        body["regions"] = result.regions
    return JSONResponse(content=body)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "mangalingo-api",
        "version": "1.16.0",
        "engine": "MangaLingo engine",
        "time": int(time.time()),
        "device": DEVICE,
        "pipeline_concurrency": PIPELINE_CONCURRENCY,
        "backends": {
            "detectors": list(DETECTOR_MAP.keys()),
            "ocrs": list(OCR_MAP.keys()),
            "translators": [t["key"] for t in TRANSLATOR_OPTIONS],
            "inpainters": list(INPAINTER_MAP.keys()),
            "renderers": list(RENDERER_MAP.keys()),
            "fonts": list(FONT_FILES.keys()),
        },
    }


@app.get("/options")
async def options():
    return {
        "detectors": [{"key": k, "name": k, "heavy": True} for k in DETECTOR_MAP.keys()],
        "ocrs": [{"key": k, "name": k, "heavy": True} for k in OCR_MAP.keys()],
        "translators": TRANSLATOR_OPTIONS,
        "inpainters": [{"key": k, "name": k, "heavy": k not in ("none", "original", "solid")} for k in INPAINTER_MAP.keys()],
        "renderers": [{"key": k, "name": k, "heavy": False} for k in RENDERER_MAP.keys()],
        "languages": [{"code": k, "name": v} for k, v in LANG_MAP.items() if k != "auto"],
        "source_languages": [{"code": k, "name": v} for k, v in LANG_MAP.items()],
        "fonts": [{"key": k} for k in FONT_FILES.keys()],
        "defaults": {
            "detector": "ctd", "ocr": "manga_ocr", "translator": "groq",
            "inpainter": "lama", "renderer": "manga2eng", "font_family": "anime_ace_3",
            "target_lang": "es", "source_lang": "auto",
        },
    }


@app.get("/cache/stats")
async def cache_stats():
    return await get_cache_stats()


@app.post("/cache/clear")
async def cache_clear():
    clear_cache()
    return {"success": True, "cleared": True}


@app.post("/translate")
async def translate_multipart(
    image: UploadFile = File(...),
    target_lang: str = Form("es"), source_lang: str = Form("auto"),
    detector: str = Form("ctd"), ocr: str = Form("manga_ocr"),
    translator: str = Form("groq"), inpainter: str = Form("lama"),
    renderer: str = Form("manga2eng"), font_family: str = Form("anime_ace_3"),
    font_size: int = Form(0), return_metadata: bool = Form(True),
    mimo_token: Optional[str] = Form(None),
):
    raw = await image.read()
    if not raw:
        raise HTTPException(400, "Imagen vacia")
    b64 = base64.b64encode(raw).decode("ascii")
    params = {
        "target_lang": target_lang, "source_lang": source_lang,
        "detector": detector, "ocr": ocr, "translator": translator,
        "inpainter": inpainter, "renderer": renderer,
        "font_family": font_family, "font_size": font_size,
        "return_metadata": return_metadata,
        "mimo_token": mimo_token,
        "mimo_model": None, "groq_key": None, "groq_model": None, "ollama_model": None,
    }
    return await _run_single(b64, params)


@app.post("/translate/json")
async def translate_json(req: Request):
    body = await req.json()
    b64 = body.get("image")
    if not b64:
        raise HTTPException(400, "Campo 'image' (base64) requerido")
    b64 = _clean_b64(b64)
    params = _get_params(body)
    return await _run_single(b64, params)


@app.post("/translate/batch")
async def translate_batch(req: Request):
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Body invalido: se esperaba JSON con { images: [base64, ...] }")

    images = body.get("images")
    if not images or not isinstance(images, list):
        raise HTTPException(400, "Campo 'images' requerido (array de base64)")
    if len(images) > 50:
        raise HTTPException(400, f"Maximo 50 imagenes por batch (enviadas {len(images)})")

    # Clean all images first
    raw_cleaned = [_clean_b64(b64) for b64 in images]

    # Verify all images in parallel
    async def _verify_one(i: int, b64: str):
        try:
            await asyncio.to_thread(_verify_image_b64, b64)
            return i, b64, None
        except Exception as exc:
            return i, b64, exc

    verify_results = await asyncio.gather(*[_verify_one(i, b) for i, b in enumerate(raw_cleaned)])
    for i, b64, exc in verify_results:
        if exc is not None:
            raise HTTPException(400, f"Imagen invalida en indice {i}: {exc}")
    cleaned = [b64 for _, b64, _ in verify_results]

    params = _get_params(body)
    resolved = resolve_translator(params["translator"])
    _validate_params({**params, "translator": resolved})

    try:
        result = await run_pipeline_batch(
            cleaned, params["target_lang"], params["source_lang"],
            params["detector"], params["ocr"], resolved,
            params["inpainter"], params["renderer"],
            params["font_family"], params["font_size"],
            mimo_token=params.get("mimo_token"),
            mimo_model=params.get("mimo_model"),
            groq_key=params.get("groq_key"),
            groq_model=params.get("groq_model"),
            ollama_model=params.get("ollama_model"),
        )
    except Exception as exc:
        log.error(f"Batch pipeline crashed: {exc}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})

    return JSONResponse(content=result)


@app.post("/translate/batch/stream")
async def translate_batch_stream(req: Request):
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Body invalido: se esperaba JSON con { images: [base64, ...] }")

    images = body.get("images")
    if not images or not isinstance(images, list):
        raise HTTPException(400, "Campo 'images' requerido (array de base64)")
    if len(images) > 50:
        raise HTTPException(400, f"Maximo 50 imagenes por batch (enviadas {len(images)})")

    # Clean all images first
    raw_cleaned = [_clean_b64(b64) for b64 in images]

    # Verify all images in parallel
    async def _verify_one(i: int, b64: str):
        try:
            await asyncio.to_thread(_verify_image_b64, b64)
            return i, b64, None
        except Exception as exc:
            return i, b64, exc

    verify_results = await asyncio.gather(*[_verify_one(i, b) for i, b in enumerate(raw_cleaned)])
    for i, b64, exc in verify_results:
        if exc is not None:
            raise HTTPException(400, f"Imagen invalida en indice {i}: {exc}")
    cleaned = [b64 for _, b64, _ in verify_results]

    params = _get_params(body)
    resolved = resolve_translator(params["translator"])
    _validate_params({**params, "translator": resolved})

    import json as _json

    async def stream_generator():
        async for event in run_pipeline_batch_stream(
            cleaned, params["target_lang"], params["source_lang"],
            params["detector"], params["ocr"], resolved,
            params["inpainter"], params["renderer"],
            params["font_family"], params["font_size"],
            mimo_token=params.get("mimo_token"),
            mimo_model=params.get("mimo_model"),
            groq_key=params.get("groq_key"),
            groq_model=params.get("groq_model"),
            ollama_model=params.get("ollama_model"),
        ):
            yield _json.dumps(event, ensure_ascii=False) + "\n"

    return StreamingResponse(
        stream_generator(),
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store", "x-batch-mode": "stream"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
