import re
import os
from typing import List

import groq

from .common import CommonTranslator, MissingAPIKeyException
from .keys import GROQ_API_KEY, GROQ_MODEL

# Máximo de globos por llamada API (evita límites de tokens)
_BATCH_CHUNK = 35


def _parse_numbered_response(content: str, expected: int, originals: List[str]) -> List[str]:
    pattern = r'\[(\d+)\]\s*(.*?)(?=\[\d+\]|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)
    if len(matches) >= expected:
        matches.sort(key=lambda x: int(x[0]))
        return [matches[i][1].strip() for i in range(expected)]
    lines = [l.strip() for l in content.split('\n') if l.strip()]
    result = []
    for i in range(expected):
        if i < len(lines):
            line = re.sub(r'^\[\d+\]\s*', '', lines[i]).strip()
            result.append(line)
        else:
            result.append(originals[i] if i < len(originals) else "")
    return result


class GroqTranslator(CommonTranslator):
    _LANGUAGE_CODE_MAP = {
        'CHS': 'Simplified Chinese', 'CHT': 'Traditional Chinese', 'CSY': 'Czech',
        'NLD': 'Dutch', 'ENG': 'English', 'FRA': 'French', 'DEU': 'German',
        'HUN': 'Hungarian', 'ITA': 'Italian', 'JPN': 'Japanese', 'KOR': 'Korean',
        'POL': 'Polish', 'PTB': 'Portuguese', 'ROM': 'Romanian', 'RUS': 'Russian',
        'ESP': 'Spanish', 'TRK': 'Turkish', 'UKR': 'Ukrainian', 'VIN': 'Vietnamese',
        'CNR': 'Montenegrin', 'SRP': 'Serbian', 'HRV': 'Croatian', 'ARA': 'Arabic',
        'THA': 'Thai', 'IND': 'Indonesian',
    }

    _MAX_REQUESTS_PER_MINUTE = 200
    _TIMEOUT = 45
    _RETRY_ATTEMPTS = 3
    _MAX_TOKENS = 8192

    _SYSTEM_TEMPLATE = (
        'You are a professional manga/comic translator. '
        'Translate each numbered line into {to_lang}. '
        'Preserve tone, emotion, and manga speech-bubble style. '
        'Keep honorifics (senpai, kun, chan) unchanged. '
        'Return ONLY translations in the same [N] text format. No explanations.'
    )

    def __init__(self, check_groq_key=True):
        super().__init__()
        self.client = groq.AsyncGroq(api_key=GROQ_API_KEY, timeout=self._TIMEOUT)
        if not self.client.api_key and check_groq_key:
            raise MissingAPIKeyException(
                'Set GROQ_API_KEY environment variable before using Groq translator.'
            )
        self.token_count = 0
        self.token_count_last = 0
        self.model = GROQ_MODEL

    def parse_args(self, args):
        pass

    async def _translate(self, from_lang: str, to_lang: str, queries: List[str]) -> List[str]:
        if not queries:
            return []

        to_name = self._LANGUAGE_CODE_MAP.get(to_lang, to_lang)
        from_name = (
            'the source language' if from_lang == 'auto'
            else self._LANGUAGE_CODE_MAP.get(from_lang, from_lang)
        )
        system = self._SYSTEM_TEMPLATE.format(to_lang=to_name)

        results: List[str] = []
        for start in range(0, len(queries), _BATCH_CHUNK):
            chunk = queries[start:start + _BATCH_CHUNK]
            numbered = '\n'.join(f'[{i + 1}] {t}' for i, t in enumerate(chunk))
            user = (
                f'Translate from {from_name} to {to_name}. '
                f'Keep the [N] prefix on each line:\n\n{numbered}'
            )
            content = await self._request_batch(system, user)
            parsed = _parse_numbered_response(content, len(chunk), chunk)
            results.extend(parsed)

        self.logger.info(
            f'Groq batch: {len(queries)} líneas en '
            f'{(len(queries) + _BATCH_CHUNK - 1) // _BATCH_CHUNK} llamada(s), '
            f'{self.token_count_last} tokens'
        )
        return results

    async def _request_batch(self, system_prompt: str, user_prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            max_tokens=self._MAX_TOKENS,
            temperature=0.2,
        )
        self.token_count += response.usage.total_tokens
        self.token_count_last = response.usage.total_tokens
        return response.choices[0].message.content.strip()
