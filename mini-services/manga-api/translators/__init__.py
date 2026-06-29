from typing import Optional, List

import py3langid as langid

from .common import *
from .baidu import BaiduTranslator
from .deepseek import DeepseekTranslator
from .youdao import YoudaoTranslator
from .deepl import DeeplTranslator
from .papago import PapagoTranslator
from .caiyun import CaiyunTranslator
from .chatgpt import OpenAITranslator
from .chatgpt_2stage import ChatGPT2StageTranslator
from .none import NoneTranslator
from .original import OriginalTranslator
from .sakura import SakuraTranslator
from .groq import GroqTranslator
from .gemini import GeminiTranslator
from .gemini_2stage import Gemini2StageTranslator
from .custom_openai import CustomOpenAiTranslator
from .mimo_token_plan import MimoTokenPlanTranslator, MimoTokenPlanV25Translator
from ..config import Translator, TranslatorConfig, TranslatorChain
from ..utils import Context

OFFLINE_TRANSLATORS = {}

GPT_TRANSLATORS = {
    Translator.chatgpt: OpenAITranslator,
    Translator.chatgpt_2stage: ChatGPT2StageTranslator,
    Translator.deepseek: DeepseekTranslator,
    Translator.groq: GroqTranslator,
    Translator.custom_openai: CustomOpenAiTranslator,
    Translator.gemini: GeminiTranslator,
    Translator.gemini_2stage: Gemini2StageTranslator,
    Translator.mimo_token_plan: MimoTokenPlanTranslator,
    Translator.mimo_token_plan_v25: MimoTokenPlanV25Translator,
}

TRANSLATORS = {
    Translator.youdao: YoudaoTranslator,
    Translator.baidu: BaiduTranslator,
    Translator.deepl: DeeplTranslator,
    Translator.papago: PapagoTranslator,
    Translator.caiyun: CaiyunTranslator,
    Translator.none: NoneTranslator,
    Translator.original: OriginalTranslator,
    Translator.sakura: SakuraTranslator,
    **GPT_TRANSLATORS,
}
translator_cache = {}

def get_translator(key: Translator, *args, **kwargs) -> CommonTranslator:
    if key not in TRANSLATORS:
        raise ValueError(f'Could not find translator for: "{key}". Choose from the following: %s' % ','.join(TRANSLATORS))
    if not translator_cache.get(key):
        translator = TRANSLATORS[key]
        translator_cache[key] = translator(*args, **kwargs)
    return translator_cache[key]

async def prepare(chain: TranslatorChain):
    for key, tgt_lang in chain.chain:
        translator = get_translator(key)
        translator.supports_languages('auto', tgt_lang, fatal=True)

async def dispatch(chain: TranslatorChain, queries: List[str], translator_config: Optional[TranslatorConfig] = None, use_mtpe: bool = False, args:Optional[Context] = None, device: str = 'cpu') -> List[str]:
    if not queries:
        return queries

    if chain.target_lang is not None:
        text_lang = ISO_639_1_TO_VALID_LANGUAGES.get(langid.classify('\n'.join(queries))[0])
        translator = None
        flag=0
        for key, lang in chain.chain:
            translator = get_translator(chain.translators[flag])
            if translator_config:
                translator.parse_args(translator_config)
            if key == "gemini_2stage" or key == "chatgpt_2stage":
                queries = await translator.translate('auto', chain.langs[flag], queries, args)
            else:
                queries = await translator.translate('auto', chain.langs[flag], queries, use_mtpe)
            flag+=1
        return queries
    if args is not None:
        args['translations'] = {}
    for key, tgt_lang in chain.chain:
        translator = get_translator(key)
        if translator_config:
            translator.parse_args(translator_config)
        if key == "gemini_2stage" or key == "chatgpt_2stage":
            queries = await translator.translate('auto', tgt_lang, queries, args)
        else:
            queries = await translator.translate('auto', tgt_lang, queries, use_mtpe)
        if args is not None:
            args['translations'][tgt_lang] = queries
    return queries


async def dispatch_batch(chain: TranslatorChain, batch_queries: List[List[str]], translator_config: Optional[TranslatorConfig] = None, use_mtpe: bool = False, args:Optional[Context] = None, device: str = 'cpu') -> List[List[str]]:
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
    'tl': 'FIL'
}

async def unload(key: Translator):
    translator_cache.pop(key, None)
