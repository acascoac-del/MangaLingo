# Este es un snippet del cambio que hay que hacer en main.py
# No es un archivo completo — son las partes que cambian

# En la función translate_multipart, agregar el parámetro:
#   mimo_token: Optional[str] = Form(None),

# En la función translate_json, agregar del body:
#   mimo_token=body.get("mimo_token"),

# Y en _run, pasar mimo_token a run_pipeline

# Las partes específicas que cambian:

"""
@app.post("/translate")
async def translate_multipart(
    image: UploadFile = File(...),
    target_lang: str = Form("es"),
    source_lang: str = Form("auto"),
    detector: str = Form("ctd"),
    ocr: str = Form("manga_ocr"),
    translator: str = Form("google"),
    inpainter: str = Form("lama"),
    renderer: str = Form("manga2eng"),
    font_family: str = Form("comic"),
    font_size: int = Form(0),
    return_metadata: bool = Form(True),
    mimo_token: Optional[str] = Form(None),  # ← NUEVO
):
    raw = await image.read()
    if not raw:
        raise HTTPException(400, "Empty image upload")
    b64 = base64.b64encode(raw).decode("ascii")
    return await _run(
        b64, target_lang, source_lang, detector, ocr, translator,
        inpainter, renderer, font_family, font_size, return_metadata,
        mimo_token=mimo_token,  # ← NUEVO
    )


@app.post("/translate/json")
async def translate_json(req: Request):
    body = await req.json()
    b64 = body.get("image")
    if not b64:
        raise HTTPException(400, "Missing 'image' (base64) field")
    if isinstance(b64, str) and "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return await _run(
        b64,
        target_lang=body.get("target_lang", "es"),
        source_lang=body.get("source_lang", "auto"),
        detector=body.get("detector", "ctd"),
        ocr=body.get("ocr", "manga_ocr"),
        translator=body.get("translator", "google"),
        inpainter=body.get("inpainter", "lama"),
        renderer=body.get("renderer", "manga2eng"),
        font_family=body.get("font_family", "comic"),
        font_size=int(body.get("font_size", 0)),
        return_metadata=bool(body.get("return_metadata", True)),
        mimo_token=body.get("mimo_token"),  # ← NUEVO
    )


async def _run(b64, target_lang, source_lang, detector, ocr, translator,
               inpainter, renderer, font_family, font_size, return_metadata,
               mimo_token=None):  # ← NUEVO parámetro
    # ... código existente ...
    result = await run_pipeline(
        b64, target_lang, source_lang, detector, ocr,
        translator, inpainter, renderer, font_family, font_size,
        mimo_token=mimo_token,  # ← NUEVO
    )
    # ... resto del código ...
"""
