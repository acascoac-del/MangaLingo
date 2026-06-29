from typing import Optional, List

import py3langid as langid

from .common import *
from .groq import GroqTranslator
from .custom_openai import CustomOpenAiTranslator
from .mimo_token_plan import MimoTokenPlanTranslator, MimoTokenPlanV25Translator
from .google import GoogleTranslator
from ..config import Translator, TranslatorConfig, TranslatorChain
from ..utils import Context


# API-backed translators only. Local/offline translators are intentionally not
# imported here to avoid slow startup and accidental local model loads.
OFFLINE_TRANSLATORS = {}

GPT_TRANSLATORS = {
    Translator.groq: GroqTranslator,
    Translator.custom_openai: CustomOpenAiTranslator,
    Translator.mimo_token_plan: MimoTokenPlanTranslator,
    Translator.mimo_token_plan_v25: MimoTokenPlanV25Translator,
    Translator.google: GoogleTranslator,
}

TRANSLATORS = {
    **GPT_TRANSLATORS,
}

translator_cache = {}


def get_translator(key: Translator, *args, **kwargs) -> CommonTranslator:
    if key not in TRANSLATORS:
        raise ValueError(
            f'Could not find translator for: "{key}". Choose from the following: %s'
            % ','.join(TRANSLATORS)
        )
    if not translator_cache.get(key):
        translator = TRANSLATORS[key]
        translator_cache[key] = translator(*args, **kwargs)
    return translator_cache[key]


async def prepare(chain: TranslatorChain):
    for key, tgt_lang in chain.chain:
        translator = get_translator(key)
        translator.supports_languages('auto', tgt_lang, fatal=True)


async def dispatch(
    chain: TranslatorChain,
    queries: List[str],
    translator_config: Optional[TranslatorConfig] = None,
    use_mtpe: bool = False,
    args: Optional[Context] = None,
    device: str = 'cpu',
) -> List[str]:
    if not queries:
        return queries

    if chain.target_lang is not None:
        langid.classify('\n'.join(queries))
        flag = 0
        for key, _lang in chain.chain:
            translator = get_translator(chain.translators[flag])
            if translator_config:
                translator.parse_args(translator_config)
            queries = await translator.translate('auto', chain.langs[flag], queries, use_mtpe)
            flag += 1
        return queries

    if args is not None:
        args['translations'] = {}

    for key, tgt_lang in chain.chain:
        translator = get_translator(key)
        if translator_config:
            translator.parse_args(translator_config)
        queries = await translator.translate('auto', tgt_lang, queries, use_mtpe)
        if args is not None:
            args['translations'][tgt_lang] = queries
    return queries


async def dispatch_batch(
    chain: TranslatorChain,
    batch_queries: List[List[str]],
    translator_config: Optional[TranslatorConfig] = None,
    use_mtpe: bool = False,
    args: Optional[Context] = None,
    device: str = 'cpu',
) -> List[List[str]]:
    if not batch_queries or not any(batch_queries):
        return batch_queries

    flat_queries = []
    query_mapping = []

    for batch_idx, queries in enumerate(batch_queries):
        for query in queries:
            flat_queries.append(query)
            query_mapping.append(batch_idx)

    flat_results = await dispatch(chain, flat_queries, translator_config, use_mtpe, args, device)

    batch_results = [[] for _ in batch_queries]
    for result, batch_idx in zip(flat_results, query_mapping):
        batch_results[batch_idx].append(result)

    return batch_results


LANGDETECT_MAP = {
    'zh-cn': 'CHS',
    'zh-tw': 'CHT',
    'cs': 'CSY',
    'nl': 'NLD',
    'en': 'ENG',
    'fr': 'FRA',
    'de': 'DEU',
    'hu': 'HUN',
    'it': 'ITA',
    'ja': 'JPN',
    'ko': 'KOR',
    'pl': 'POL',
    'pt': 'PTB',
    'ro': 'ROM',
    'ru': 'RUS',
    'es': 'ESP',
    'tr': 'TRK',
    'uk': 'UKR',
    'vi': 'VIN',
    'ar': 'ARA',
    'hr': 'HRV',
    'th': 'THA',
    'id': 'IND',
    'tl': 'FIL',
}


async def unload(key: Translator):
    translator_cache.pop(key, None)
