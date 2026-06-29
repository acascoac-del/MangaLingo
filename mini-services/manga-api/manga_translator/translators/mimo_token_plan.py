"""
MangaLingo — Xiaomi MiMo Token Plan Translator
================================================

Traductor que usa la API del Token Plan de Xiaomi MiMo.
Endpoint: https://token-plan-sgp.xiaomimimo.com/v1
Modelos disponibles: mimo-v2.5-pro, mimo-v2.5

Formato de clave API del Token Plan: tp-xxxxx
Se puede configurar via variable de entorno MIMO_TOKEN_PLAN_API_KEY
o pasarse por request desde la extensión (campo mimo_token).
"""

from __future__ import annotations
import os
import re
import logging
import asyncio
from typing import List, Optional

from .common import CommonTranslator, MissingAPIKeyException
from .keys import MIMO_TOKEN_PLAN_API_KEY, MIMO_TOKEN_PLAN_API_BASE, MIMO_TOKEN_PLAN_MODEL

log = logging.getLogger("manga-pipeline")

# Mapa de idiomas MangaLingo → nombre en inglés para el prompt
_LANG_NAMES = {
    "ESP": "Spanish", "ENG": "English", "FRA": "French", "DEU": "German",
    "ITA": "Italian", "PTB": "Portuguese", "RUS": "Russian", "JPN": "Japanese",
    "KOR": "Korean", "CHS": "Simplified Chinese", "CHT": "Traditional Chinese",
    "ARA": "Arabic", "NLD": "Dutch", "POL": "Polish", "TRK": "Turkish",
    "IND": "Indonesian", "VIN": "Vietnamese", "THA": "Thai", "HIN": "Hindi",
    "CSY": "Czech", "HUN": "Hungarian", "ROM": "Romanian", "UKR": "Ukrainian",
    "HRV": "Croatian", "SRP": "Serbian", "CNR": "Montenegrin",
}


class MimoTokenPlanTranslator(CommonTranslator):
    """Traductor usando la API del Token Plan de Xiaomi MiMo.

    Soporta mimo-v2.5-pro (premium) y mimo-v2.5 (estándar).
    La clave API tiene el formato tp-xxxxx y se configura via
    la variable de entorno MIMO_TOKEN_PLAN_API_KEY.
    """

    _LANGUAGE_CODE_MAP = {k: v for k, v in _LANG_NAMES.items()}

    _MAX_REQUESTS_PER_MINUTE = 120
    _TIMEOUT = 45
    _RETRY_ATTEMPTS = 3

    # Modelo por defecto (puede sobreescribirse con MIMO_TOKEN_PLAN_MODEL)
    _DEFAULT_MODEL = "mimo-v2.5-pro"

    _SYSTEM_TEMPLATE = (
        "You are a professional manga/comic translator. "
        "Translate the following text from {from_lang} to {to_lang}. "
        "Preserve tone, emotion, and context of the original. "
        "Keep it natural and conversational for manga speech bubbles. "
        "Retain Japanese honorifics and cultural terms as-is (e.g. senpai, kun, chan). "
        "Do NOT add explanations or notes. "
        "Return ONLY the translations in the same numbered format [N] text."
    )

    def __init__(self, check_key: bool = False):
        super().__init__()
        self.api_key = MIMO_TOKEN_PLAN_API_KEY
        self.api_base = MIMO_TOKEN_PLAN_API_BASE.rstrip('/')
        self.model = MIMO_TOKEN_PLAN_MODEL or self._DEFAULT_MODEL

        if check_key and not self.api_key:
            raise MissingAPIKeyException(
                "Configurá la variable de entorno MIMO_TOKEN_PLAN_API_KEY con tu "
                "clave del Token Plan (formato: tp-xxxxx). "
                "Más info: https://token-plan-sgp.xiaomimimo.com"
            )

    def parse_args(self, args):
        # Permite sobreescribir la api_key desde el config si se pasa
        if hasattr(args, 'mimo_token') and args.mimo_token:
            self.api_key = args.mimo_token
        if hasattr(args, 'mimo_model') and args.mimo_model:
            self.model = args.mimo_model

    async def _translate(self, from_lang: str, to_lang: str, queries: List[str]) -> List[str]:
        if not queries:
            return []
        if not self.api_key:
            raise MissingAPIKeyException(
                "MIMO_TOKEN_PLAN_API_KEY no está configurada. "
                "Formato de clave: tp-xxxxx"
            )

        to_name = _LANG_NAMES.get(to_lang, to_lang)
        from_name = "the source language" if from_lang == "auto" else _LANG_NAMES.get(from_lang, from_lang)

        numbered = "\n".join(f"[{i+1}] {t}" for i, t in enumerate(queries))
        system_prompt = self._SYSTEM_TEMPLATE.format(from_lang=from_name, to_lang=to_name)
        user_prompt = f"Translate each line to {to_name}. Keep the [N] prefix:\n\n{numbered}"

        for attempt in range(self._RETRY_ATTEMPTS):
            try:
                result = await self._request(system_prompt, user_prompt)
                translations = _parse_numbered_response(result, len(queries), queries)
                log.info(f"MiMo TokenPlan ({self.model}): {len(translations)}/{len(queries)} líneas traducidas")
                return translations
            except Exception as exc:
                log.warning(f"MiMo TokenPlan intento {attempt+1}/{self._RETRY_ATTEMPTS}: {exc}")
                if attempt == self._RETRY_ATTEMPTS - 1:
                    raise
                await asyncio.sleep(2 ** attempt)

        return queries  # fallback

    async def _request(self, system_prompt: str, user_prompt: str) -> str:
        try:
            import httpx
        except ImportError:
            raise ImportError("httpx es requerido para MimoTokenPlanTranslator. Instalar: pip install httpx")

        url = f"{self.api_base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 4096,
        }

        async with httpx.AsyncClient(timeout=self._TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 401:
            raise MissingAPIKeyException(
                f"Clave MiMo Token Plan inválida o expirada ({self.api_key[:8]}...). "
                "Verificá que el formato sea tp-xxxxx."
            )
        elif resp.status_code == 429:
            raise Exception("Rate limit del MiMo Token Plan excedido. Esperá y reintentá.")
        elif resp.status_code != 200:
            raise Exception(f"Error HTTP {resp.status_code} de MiMo API: {resp.text[:200]}")

        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


def _parse_numbered_response(content: str, expected: int, originals: List[str]) -> List[str]:
    """Parsea respuesta numerada [1] texto\n[2] texto..."""
    pattern = r'\[(\d+)\]\s*(.*?)(?=\[\d+\]|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)

    if len(matches) >= expected:
        matches.sort(key=lambda x: int(x[0]))
        return [matches[i][1].strip() for i in range(expected)]

    # Fallback: líneas
    lines = [l.strip() for l in content.split('\n') if l.strip()]
    result = []
    for i in range(expected):
        if i < len(lines):
            line = re.sub(r'^\[\d+\]\s*', '', lines[i]).strip()
            result.append(line)
        else:
            result.append(originals[i] if i < len(originals) else "")
    return result


# Variante con modelo mimo-v2.5 (estándar)
class MimoTokenPlanV25Translator(MimoTokenPlanTranslator):
    """Variante usando el modelo mimo-v2.5 (estándar, más rápido)."""
    _DEFAULT_MODEL = "mimo-v2.5"

    def __init__(self, check_key: bool = True):
        super().__init__(check_key=check_key)
        # Forzar modelo v2.5 si no hay override de env
        if not os.getenv('MIMO_TOKEN_PLAN_MODEL'):
            self.model = self._DEFAULT_MODEL
