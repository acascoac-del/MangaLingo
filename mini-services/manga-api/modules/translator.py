"""Translation bridges for the lightweight module pipeline.

Only Groq, Xiaomi MiMo and Ollama are exposed. Older free/local fallback
bridges were removed so the API cannot silently switch to an unsupported
translator.
"""

from __future__ import annotations

import os
import re

import httpx
import openai


_LANG_TO_NAME = {
    "auto": "auto",
    "es": "Spanish",
    "en": "English",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pt-BR": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Simplified Chinese",
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ar": "Arabic",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "id": "Indonesian",
    "vi": "Vietnamese",
    "th": "Thai",
    "hi": "Hindi",
}


def _chunked(seq: list[str], size: int = 35):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class _BaseBridge:
    def translate_batch(self, texts: list[str], target_lang: str, source_lang: str = "auto") -> list[str]:
        raise NotImplementedError


class GroqTranslatorBridge(_BaseBridge):
    def __init__(self):
        key = os.environ.get("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY not set")
        self._model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
        self._client = openai.OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")

    def translate_batch(self, texts: list[str], target_lang: str, source_lang: str = "auto") -> list[str]:
        return _openai_compatible_translate(self._client, self._model, texts, target_lang, source_lang)


class OllamaTranslatorBridge(_BaseBridge):
    def __init__(self):
        self._model = os.environ.get("CUSTOM_OPENAI_MODEL") or os.environ.get("OLLAMA_MODEL")
        if not self._model:
            raise RuntimeError("CUSTOM_OPENAI_MODEL or OLLAMA_MODEL not set")
        base_url = os.environ.get("CUSTOM_OPENAI_API_BASE", "http://localhost:11434/v1")
        api_key = os.environ.get("CUSTOM_OPENAI_API_KEY", "ollama")
        self._client = openai.OpenAI(api_key=api_key, base_url=base_url)

    def translate_batch(self, texts: list[str], target_lang: str, source_lang: str = "auto") -> list[str]:
        return _openai_compatible_translate(self._client, self._model, texts, target_lang, source_lang)


class XiaomiTranslatorBridge(_BaseBridge):
    def __init__(self):
        self._key = os.environ.get("MIMO_TOKEN_PLAN_API_KEY")
        if not self._key:
            raise RuntimeError("MIMO_TOKEN_PLAN_API_KEY not set")
        self._base = os.environ.get("MIMO_TOKEN_PLAN_API_BASE", "https://token-plan-sgp.xiaomimimo.com/v1").rstrip("/")
        self._model = os.environ.get("MIMO_TOKEN_PLAN_MODEL", "mimo-v2.5")

    def translate_batch(self, texts: list[str], target_lang: str, source_lang: str = "auto") -> list[str]:
        results = []
        for chunk in _chunked(texts):
            payload = {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": _system_prompt(target_lang)},
                    {"role": "user", "content": _numbered_prompt(chunk, target_lang, source_lang)},
                ],
                "temperature": 0.2,
                "max_tokens": 4096,
            }
            resp = httpx.post(
                f"{self._base}/chat/completions",
                headers={"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"},
                json=payload,
                timeout=45,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            results.extend(_parse_numbered_response(content, len(chunk), chunk))
        return results


def _system_prompt(target_lang: str) -> str:
    to_name = _LANG_TO_NAME.get(target_lang, target_lang)
    return (
        f"You are a professional manga/comic translator. Translate each numbered line into {to_name}. "
        "Preserve tone and speech-bubble style. Return only translations in the same [N] format."
    )


def _numbered_prompt(texts: list[str], target_lang: str, source_lang: str) -> str:
    target = _LANG_TO_NAME.get(target_lang, target_lang)
    source = "the source language" if source_lang == "auto" else _LANG_TO_NAME.get(source_lang, source_lang)
    numbered = "\n".join(f"[{i + 1}] {text}" for i, text in enumerate(texts))
    return f"Translate from {source} to {target}. Keep [N] prefixes:\n\n{numbered}"


def _openai_compatible_translate(client, model: str, texts: list[str], target_lang: str, source_lang: str) -> list[str]:
    results = []
    for chunk in _chunked(texts):
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _system_prompt(target_lang)},
                {"role": "user", "content": _numbered_prompt(chunk, target_lang, source_lang)},
            ],
            max_tokens=4096,
            temperature=0.2,
        )
        content = response.choices[0].message.content or ""
        results.extend(_parse_numbered_response(content, len(chunk), chunk))
    return results


def _parse_numbered_response(content: str, expected: int, originals: list[str]) -> list[str]:
    matches = re.findall(r"\[(\d+)\]\s*(.*?)(?=\[\d+\]|\Z)", content, re.DOTALL)
    if len(matches) >= expected:
        matches.sort(key=lambda x: int(x[0]))
        return [matches[i][1].strip() for i in range(expected)]

    lines = [line.strip() for line in content.splitlines() if line.strip()]
    return [
        re.sub(r"^\[\d+\]\s*", "", lines[i]).strip() if i < len(lines) else originals[i]
        for i in range(expected)
    ]
