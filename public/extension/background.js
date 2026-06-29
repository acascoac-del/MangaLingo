/* MangaLingo — background service worker (Manifest V3) v1.11.0
 *
 * FIX v1.11.0: fetchImageAsBase64 con múltiples estrategias para CDNs sin CORS.
 *
 * FIX v1.10.1: mimoToken ahora se guarda y carga correctamente.
 * Antes no estaba en DEFAULT_SETTINGS → chrome.storage.sync.get no lo traía.
 */

const DEFAULT_API = 'http://localhost:3000';

// ⚡ FIX: agregar mimoToken a DEFAULT_SETTINGS para que se guarde/cargue
const DEFAULT_SETTINGS = {
  apiBase: DEFAULT_API,
  targetLang: 'es', sourceLang: 'auto',
  detector: 'ctd', ocr: 'manga_ocr', translator: 'groq',
  inpainter: 'solid', renderer: 'manga2eng',
  fontFamily: 'anime_ace_3', fontSize: 0, autoTranslate: false,
  mimoToken: '',
  mimoModel: 'mimo-v2.5-pro',
  groqKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  ollamaModel: '',
};

const MIMO_TRANSLATORS = new Set(['xiaomi']);

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
}

async function getApiBase() {
  const s = await getSettings();
  return (s.apiBase || '').trim() || DEFAULT_API;
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  chrome.contextMenus.create({ id: 'translate-image', title: '🌍 Traducir esta imagen con MangaLingo', contexts: ['image'] });
  chrome.contextMenus.create({ id: 'translate-page-images', title: '📚 Traducir todas las imágenes de la página', contexts: ['page', 'frame'] });
  chrome.contextMenus.create({ id: 'separator-1', type: 'separator', contexts: ['page', 'frame', 'image'] });
  chrome.contextMenus.create({ id: 'open-options', title: '⚙️ Ajustes de MangaLingo', contexts: ['page', 'frame', 'image'] });
  chrome.alarms.create('keepalive', { periodInMinutes: 0.25 });
});

chrome.alarms.onAlarm.addListener(() => {});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'translate-image' && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, { type: 'translate-one', srcUrl: info.srcUrl }).catch(() => {});
  } else if (info.menuItemId === 'translate-page-images') {
    chrome.tabs.sendMessage(tab.id, { type: 'translate-all' }).catch(() => {});
  } else if (info.menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.commands?.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (cmd === 'translate-current-image') chrome.tabs.sendMessage(tab.id, { type: 'translate-hovered' }).catch(() => {});
  else if (cmd === 'translate-all-images') chrome.tabs.sendMessage(tab.id, { type: 'translate-all' }).catch(() => {});
});

// Port-based handler for large single-image translations (avoids 64KB sendMessage limit)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate-single') return;
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'translate') return;
    try {
      const data = await translateBase64(msg.b64, msg.options || {});
      port.postMessage({ type: 'result', ok: true, data, reqId: msg.reqId });
    } catch (e) {
      port.postMessage({ type: 'result', ok: false, error: String(e?.message || e), reqId: msg.reqId });
    }
  });
});

async function isContentScriptLoaded(tabId) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'ping' }); return true; } catch (_) { return false; }
}

async function ensureContentScript(tabId) {
  if (await isContentScriptLoaded(tabId)) return { ok: true, alreadyInjected: true };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    return { ok: true, alreadyInjected: false };
  } catch (e) { return { ok: false, error: e.message }; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'translate-blob') {
    translateBase64(msg.b64, msg.options || {}, sender?.tab?.id, msg.requestId)
      .catch((e) => {
        const errMsg = String(e?.message || e);
        chrome.runtime.sendMessage({ type: 'translate-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
        if (sender?.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'translate-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
      });
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'translate-batch') {
    translateBatch(msg.images || [], msg.options || {}, sender?.tab?.id, msg.requestId)
      .catch((e) => {
        const errMsg = String(e?.message || e);
        chrome.runtime.sendMessage({ type: 'translate-batch-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
        if (sender?.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'translate-batch-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
      });
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'translate-batch-stream') {
    translateBatchStream(msg.images || [], msg.options || {}, sender?.tab?.id, msg.requestId)
      .catch((e) => {
        const errMsg = String(e?.message || e);
        chrome.runtime.sendMessage({ type: 'translate-batch-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
        if (sender?.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'translate-batch-result', ok: false, error: errMsg, requestId: msg.requestId }).catch(() => {});
      });
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'fetch-image') {
    fetchImageAsBase64(msg.url)
      .then((b64) => { try { chrome.tabs.sendMessage(sender.tab.id, { type: 'fetch-image-result', ok: true, b64, requestId: msg.requestId }).catch(() => {}); } catch (_) {} })
      .catch((e) => { try { chrome.tabs.sendMessage(sender.tab.id, { type: 'fetch-image-result', ok: false, error: String(e?.message || e), requestId: msg.requestId }).catch(() => {}); } catch (_) {} });
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'translate-all-on-tab') {
    handleTranslateAllOnTab().catch(() => {});
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'check-tab-status') {
    checkTabStatus()
      .then((result) => chrome.runtime.sendMessage({ type: 'tab-status-result', ok: true, data: result }).catch(() => {}))
      .catch((e) => chrome.runtime.sendMessage({ type: 'tab-status-result', ok: false, error: String(e?.message || e) }).catch(() => {}));
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'fetch-options') {
    fetchOptions()
      .then((data) => chrome.runtime.sendMessage({ type: 'options-result', ok: true, data }).catch(() => {}))
      .catch((e) => chrome.runtime.sendMessage({ type: 'options-result', ok: false, error: String(e?.message || e) }).catch(() => {}));
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'get-settings') {
    getSettings()
      .then((s) => chrome.runtime.sendMessage({ type: 'settings-result', ok: true, data: s }).catch(() => {}))
      .catch(() => {});
    sendResponse({ ok: true, received: true });
    return false;
  }

  if (msg?.type === 'save-settings') {
    // ⚡ FIX: guardar TODOS los settings incluyendo mimoToken
    chrome.storage.sync.set(msg.settings || {})
      .then(() => {
        console.log('[MangaLingo] Settings guardados:', Object.keys(msg.settings || {}));
        chrome.runtime.sendMessage({ type: 'settings-saved', ok: true }).catch(() => {});
      })
      .catch((e) => {
        console.error('[MangaLingo] Error guardando settings:', e);
      });
    sendResponse({ ok: true, received: true });
    return false;
  }

  return false;
});

async function handleTranslateAllOnTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { chrome.runtime.sendMessage({ type: 'translate-all-result', ok: false, error: 'No se encontró pestaña activa' }).catch(() => {}); return; }
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    chrome.runtime.sendMessage({ type: 'translate-all-result', ok: false, error: `Página no soportada: ${tab.url || '(sin URL)'}` }).catch(() => {});
    return;
  }
  const injectResult = await ensureContentScript(tab.id);
  if (!injectResult.ok) { chrome.runtime.sendMessage({ type: 'translate-all-result', ok: false, error: `No se pudo inyectar: ${injectResult.error}` }).catch(() => {}); return; }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'translate-all' });
    chrome.runtime.sendMessage({ type: 'translate-all-result', ok: true, message: 'Mensaje enviado.' }).catch(() => {});
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'translate-all-result', ok: false, error: e.message }).catch(() => {});
  }
}

async function checkTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { hasTab: false };
  const url = tab.url || '';
  const isHttp = /^https?:\/\//.test(url);
  let canInject = false, injectError = null, imageCount = 0;
  if (isHttp) {
    const injectResult = await ensureContentScript(tab.id);
    if (injectResult.ok) {
      canInject = true;
      try { const countResp = await chrome.tabs.sendMessage(tab.id, { type: 'count-images' }); imageCount = countResp?.count || 0; } catch (e) { injectError = e.message; }
    } else { injectError = injectResult.error; }
  }
  return { hasTab: true, tabId: tab.id, title: tab.title || '(sin título)', url, isHttp, isChromeInternal: /^(chrome|chrome-extension|edge|about|file):/i.test(url), canInject, injectError, imageCount };
}

async function translateBase64(b64, options = {}, sourceTabId = null, requestId = null) {
  const settings = await getSettings();
  const body = {
    image: b64,
    target_lang: options.target_lang || settings.targetLang,
    source_lang: options.source_lang || settings.sourceLang,
    detector: options.detector || settings.detector,
    ocr: options.ocr || settings.ocr,
    translator: options.translator || settings.translator,
    inpainter: options.inpainter || settings.inpainter,
    renderer: options.renderer || settings.renderer,
    font_family: options.font_family || settings.fontFamily,
    font_size: Number(options.font_size ?? settings.fontSize ?? 0),
    return_metadata: true,
    // ⚡ FIX: pasar el token MiMo al backend
    mimo_token: settings.mimoToken || null,
    mimo_model: settings.mimoModel || null,
    groq_key: settings.groqKey || null,
    groq_model: settings.groqModel || null,
    ollama_model: settings.ollamaModel || null,
  };

  // Validar token MiMo Token Plan (formato tp-xxxxx)
  if (MIMO_TRANSLATORS.has(body.translator) && !body.mimo_token) {
    throw new Error('Token MiMo no configurado. Andá a Ajustes → pegá tu clave tp-xxxxx del Token Plan.');
  }

  const apiBase = await getApiBase();
  const candidates = [`${apiBase}/api/translate`, `${DEFAULT_API}/api/translate`];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status} @ ${url}`); continue; }
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'pipeline failed');
      chrome.runtime.sendMessage({ type: 'translate-result', ok: true, data, requestId }).catch(() => {});
      if (sourceTabId) chrome.tabs.sendMessage(sourceTabId, { type: 'translate-result', ok: true, data, requestId }).catch(() => {});
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No se pudo contactar con la API');
}

async function translateBatch(b64List, options = {}, sourceTabId = null, requestId = null) {
  const settings = await getSettings();
  const body = {
    images: b64List,
    target_lang: options.target_lang || settings.targetLang,
    source_lang: options.source_lang || settings.sourceLang,
    detector: options.detector || settings.detector,
    ocr: options.ocr || settings.ocr,
    translator: options.translator || settings.translator,
    inpainter: options.inpainter || settings.inpainter,
    renderer: options.renderer || settings.renderer,
    font_family: options.font_family || settings.fontFamily,
    font_size: Number(options.font_size ?? settings.fontSize ?? 0),
    mimo_token: settings.mimoToken || null,
    mimo_model: settings.mimoModel || null,
    groq_key: settings.groqKey || null,
    groq_model: settings.groqModel || null,
    ollama_model: settings.ollamaModel || null,
  };

  if (MIMO_TRANSLATORS.has(body.translator) && !body.mimo_token) {
    throw new Error('Token MiMo no configurado. Andá a Ajustes → pegá tu clave tp-xxxxx del Token Plan.');
  }

  const apiBase = await getApiBase();
  const candidates = [`${apiBase}/api/translate/batch`, `${DEFAULT_API}/api/translate/batch`];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status} @ ${url}`); continue; }
      const data = await r.json();
      if (!data.success && data.succeeded === 0) throw new Error(data.error || 'batch pipeline failed');
      chrome.runtime.sendMessage({ type: 'translate-batch-result', ok: true, data, requestId }).catch(() => {});
      if (sourceTabId) chrome.tabs.sendMessage(sourceTabId, { type: 'translate-batch-result', ok: true, data, requestId }).catch(() => {});
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No se pudo contactar con la API batch');
}

async function translateBatchStream(b64List, options = {}, sourceTabId = null, requestId = null) {
  const settings = await getSettings();
  const body = {
    images: b64List,
    target_lang: options.target_lang || settings.targetLang,
    source_lang: options.source_lang || settings.sourceLang,
    detector: options.detector || settings.detector,
    ocr: options.ocr || settings.ocr,
    translator: options.translator || settings.translator,
    inpainter: options.inpainter || settings.inpainter,
    renderer: options.renderer || settings.renderer,
    font_family: options.font_family || settings.fontFamily,
    font_size: Number(options.font_size ?? settings.fontSize ?? 0),
    mimo_token: settings.mimoToken || null,
    mimo_model: settings.mimoModel || null,
    groq_key: settings.groqKey || null,
    groq_model: settings.groqModel || null,
    ollama_model: settings.ollamaModel || null,
  };

  if (MIMO_TRANSLATORS.has(body.translator) && !body.mimo_token) {
    throw new Error('Token MiMo no configurado. Andá a Ajustes → pegá tu clave tp-xxxxx del Token Plan.');
  }

  const apiBase = await getApiBase();
  const candidates = [`${apiBase}/api/translate/batch/stream`, `${DEFAULT_API}/api/translate/batch/stream`];
  let lastErr = null;
  
  const timeoutMs = Math.max(300000, b64List.length * 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!r.ok) { 
        let errText = await r.text().catch(() => '');
        lastErr = new Error(`HTTP ${r.status} @ ${url} - ${errText}`); 
        continue; 
      }
      
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.type === 'progress') {
                if (sourceTabId) chrome.tabs.sendMessage(sourceTabId, { type: 'translate-batch-progress', data, requestId }).catch(() => {});
              } else if (data.type === 'complete') {
                if (!data.success) {
                  throw new Error(data.error || 'batch pipeline failed');
                }
                chrome.runtime.sendMessage({ type: 'translate-batch-result', ok: true, data, requestId }).catch(() => {});
                if (sourceTabId) chrome.tabs.sendMessage(sourceTabId, { type: 'translate-batch-result', ok: true, data, requestId }).catch(() => {});
                clearTimeout(timer);
                return data;
              }
            } catch (e) {
              if (e.name !== 'SyntaxError') throw e;
            }
          }
        }
      }
      clearTimeout(timer);
      return;
    } catch (e) { lastErr = e; }
  }
  clearTimeout(timer);
  throw lastErr || new Error('No se pudo contactar con la API batch stream');
}

async function fetchOptions() {
  const apiBase = await getApiBase();
  for (const url of [`${apiBase}/api/options`, `${DEFAULT_API}/api/options`]) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {}
  }
  return null;
}

async function fetchImageAsBase64(url) {
  // Helper: read response as blob → base64
  async function readBlob(resp) {
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) throw new Error(`Tipo inesperado del servidor: ${ct}`);
    const blob = await resp.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  // Try 1: default fetch (host permissions should allow reading the body)
  try {
    const r = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (r.ok) return await readBlob(r);
  } catch (_) {}

  // Try 2: with referrer (anti-hotlinking)
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'unsafe-url', signal: AbortSignal.timeout(15000) });
    if (r.ok) return await readBlob(r);
  } catch (_) {}

  // Try 3: include cookies (some CDNs require session)
  try {
    const r = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(15000) });
    if (r.ok) return await readBlob(r);
  } catch (_) {}

  throw new Error(
    `El servidor de imágenes (${new URL(url).hostname}) bloquea el acceso externo (sin CORS). ` +
    `Descargá las imágenes manualmente y usá el demo en http://localhost:3000`
  );
}
