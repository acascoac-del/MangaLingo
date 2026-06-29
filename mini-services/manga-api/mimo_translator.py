"""
MangaLingo — Xiaomi MiMo Token Plan (legacy helper)
====================================================
Endpoint: https://token-plan-sgp.xiaomimimo.com/v1
Modelos: mimo-v2.5-pro, mimo-v2.5
Clave API formato: tp-xxxxx
"""

from __future__ import annotations
import logging
import re
from typing import Optional

log = logging.getLogger("manga-pipeline")

MIMO_API_URL = "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions"
MIMO_MODEL = "mimo-v2.5-pro"

LANG_NAMES = {
    "ESP": "Spanish", "ENG": "English", "FRA": "French", "DEU": "German",
    "ITA": "Italian", "PTB": "Portuguese", "RUS": "Russian", "JPN": "Japanese",
    "KOR": "Korean", "CHS": "Simplified Chinese", "CHT": "Traditional Chinese",
    "ARA": "Arabic", "NLD": "Dutch", "POL": "Polish", "TRK": "Turkish",
    "IND": "Indonesian", "VIN": "Vietnamese", "THA": "Thai", "HIN": "Hindi",
}


async def translate_with_mimo(texts, target_lang, source_lang, token, model: Optional[str] = None):
    if not token:
        raise ValueError("Token MiMo Token Plan no proporcionado (formato tp-xxxxx).")
    if not texts:
        return []

    target_name = LANG_NAMES.get(target_lang, target_lang)
    source_name = "the source language" if source_lang == "auto" else LANG_NAMES.get(source_lang, source_lang)
    numbered = "\n".join(f"[{i+1}] {t}" for i, t in enumerate(texts))

    system_prompt = (
        f"You are a professional manga/comic translator. "
        f"Translate the following text from {source_name} to {target_name}. "
        f"Preserve the tone, emotion, and context of the original. "
        f"Keep it natural and conversational, suitable for manga speech bubbles. "
        f"Do not add explanations or notes. "
        f"Return ONLY the translations in the same numbered format."
    )
    user_prompt = f"Translate each line below to {target_name}. Keep the [N] number prefix:\n\n{numbered}"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(MIMO_API_URL, headers={
                "Authorization": f"Bearer {token}", "Content-Type": "application/json",
            }, json={
                "model": model or MIMO_MODEL,
                "messages": [{"role": "system", "content": system_prompt},
                             {"role": "user", "content": user_prompt}],
                "temperature": 0.3, "max_tokens": 4096,
            })
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            translations = _parse_numbered_response(content, len(texts))
            log.info(f"MiMo Token Plan: traducidas {len(translations)}/{len(texts)} líneas")
            return translations
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 401:
            raise ValueError("Clave MiMo Token Plan inválida (formato tp-xxxxx).")
        elif status == 429:
            raise ValueError("Rate limit del MiMo Token Plan excedido.")
        else:
            raise ValueError(f"Error HTTP {status} de MiMo Token Plan API")
    except httpx.ConnectError:
        raise ValueError("No se pudo conectar a MiMo Token Plan API.")
    except Exception as e:
        raise ValueError(f"Error llamando MiMo Token Plan API: {e}")


def _parse_numbered_response(content, expected_count):
    translations = []
    pattern = r'\[(\d+)\]\s*(.*?)(?=\[\d+\]|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)
    if len(matches) >= expected_count:
        matches.sort(key=lambda x: int(x[0]))
        for i in range(expected_count):
            translations.append(matches[i][1].strip())
    else:
        lines = [l.strip() for l in content.split('\n') if l.strip()]
        for i in range(min(expected_count, len(lines))):
            line = re.sub(r'^\[\d+\]\s*', '', lines[i])
            translations.append(line)
        while len(translations) < expected_count:
            translations.append("")
    return translations
