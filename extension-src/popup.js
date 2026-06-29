/* MangaLingo — popup controller v1.12.0
 * NUEVO:
 *  - Multi-imagen: hasta 5 imágenes con barra de progreso
 *  - Ollama: carga modelos instalados filtrados para traducción
 *  - Groq: campo API Key + carga modelos disponibles (igual diseño Xiaomi)
 */
const DEFAULT_API = 'http://localhost:3000';
let backendStatus = 'checking';

// ── Image queue (multi-upload) ─────────────────────────────────────────────
const MAX_IMAGES = 5;
let imageQueue = []; // [{ b64, name, origSrc, translatedSrc, status }]

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  if (tabName === 'settings') loadSettings();
  if (tabName === 'page') loadActiveTabInfo();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
activateTab('translate');

// ── File input / drop ─────────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const translateBtn = document.getElementById('translate-btn');

document.getElementById('pick-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  if (files.length) loadFiles(files);
  fileInput.value = '';
});
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragging');
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length) loadFiles(files);
});
dropzone.addEventListener('click', () => fileInput.click());

document.getElementById('url-go').addEventListener('click', async () => {
  const url = document.getElementById('url-input').value.trim();
  if (!url) return;
  try {
    const r = await fetch(url, { mode: 'cors' });
    const blob = await r.blob();
    loadFiles([new File([blob], 'image', { type: blob.type })]);
  } catch (e) { showError(`No se pudo descargar: ${e.message}`); }
});

document.getElementById('queue-clear').addEventListener('click', () => {
  imageQueue = [];
  renderQueue();
  document.getElementById('result').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');
  translateBtn.disabled = (backendStatus === 'down');
  document.getElementById('translate-btn-text').textContent = '✨ Traducir imagen';
});

function loadFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return alert('Tiene que ser una imagen');
  const remaining = MAX_IMAGES - imageQueue.length;
  if (remaining <= 0) return alert(`Ya tenés ${MAX_IMAGES} imágenes. Limpiá la cola primero.`);
  const toLoad = imageFiles.slice(0, remaining);
  if (imageFiles.length > remaining) alert(`Solo se agregaron ${remaining} de ${imageFiles.length} (límite: ${MAX_IMAGES})`);

  toLoad.forEach(f => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const b64 = s.includes(',') ? s.split(',')[1] : s;
      imageQueue.push({ b64, name: f.name, origSrc: s, translatedSrc: null, status: 'pending' });
      renderQueue();
    };
    r.readAsDataURL(f);
  });
}

function renderQueue() {
  const panel = document.getElementById('queue-panel');
  const list = document.getElementById('queue-list');
  const countEl = document.getElementById('queue-count');
  const singleResult = document.getElementById('result');

  if (imageQueue.length === 0) {
    panel.classList.add('hidden');
    translateBtn.disabled = (backendStatus === 'down');
    document.getElementById('translate-btn-text').textContent = '✨ Traducir imagen';
    return;
  }

  panel.classList.remove('hidden');
  countEl.textContent = `${imageQueue.length} imagen${imageQueue.length !== 1 ? 'es' : ''}`;

  if (imageQueue.length === 1) {
    singleResult.classList.remove('hidden');
    document.getElementById('orig-img').src = imageQueue[0].origSrc;
    if (imageQueue[0].translatedSrc) {
      document.getElementById('out-img').src = imageQueue[0].translatedSrc;
    }
    list.innerHTML = '';
    panel.querySelector('.queue-list').parentElement.querySelector('.queue-header').style.display = 'none';
  } else {
    singleResult.classList.add('hidden');
    panel.querySelector('.queue-header').style.display = '';
    list.innerHTML = imageQueue.map((item, i) => {
      const iconMap = { pending: '⏳', processing: '⚙️', done: '✅', error: '❌' };
      const ic = iconMap[item.status] || '⏳';
      const nameShort = item.name.length > 28 ? item.name.slice(0, 25) + '…' : item.name;
      const dlBtn = item.translatedSrc
        ? `<a class="btn-tiny" href="data:image/png;base64,${item.translatedSrc}" download="translated_${i+1}.png">⬇</a>`
        : '';
      return `<div class="queue-item queue-item-${item.status}">
        <span class="qi-icon">${ic}</span>
        <span class="qi-name">${escapeHtml(nameShort)}</span>
        ${dlBtn}
        <button class="btn-tiny qi-remove" data-idx="${i}">✕</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.qi-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.target.dataset.idx);
        imageQueue.splice(idx, 1);
        renderQueue();
      });
    });
  }

  const pending = imageQueue.filter(x => x.status === 'pending').length;
  translateBtn.disabled = (backendStatus === 'down' || pending === 0);
  const label = imageQueue.length === 1
    ? '✨ Traducir imagen'
    : `✨ Traducir ${pending} imagen${pending !== 1 ? 'es' : ''}`;
  document.getElementById('translate-btn-text').textContent = label;
}

// ── Translate button ───────────────────────────────────────────────────────
translateBtn.addEventListener('click', () => {
  if (backendStatus === 'down') { showError('Backend no disponible.'); return; }

  if (imageQueue.length === 0) return;

  if (imageQueue.length === 1) {
    translateSingle(imageQueue[0]);
  } else {
    translateMultiple();
  }
});

function translateSingle(item) {
  const spinner = document.getElementById('spinner');
  const btnText = document.getElementById('translate-btn-text');
  spinner.classList.remove('hidden'); translateBtn.disabled = true; btnText.textContent = 'Traduciendo…';
  document.getElementById('error').classList.add('hidden');
  document.getElementById('out-img').src = '';
  document.getElementById('meta-text').textContent = 'Procesando…';
  chrome.runtime.sendMessage({ type: 'translate-blob', b64: item.b64, options: {} }, () => {
    if (chrome.runtime.lastError) {
      showError('Background: ' + chrome.runtime.lastError.message);
      spinner.classList.add('hidden'); translateBtn.disabled = false; btnText.textContent = '✨ Traducir imagen';
    }
  });
}

async function translateMultiple() {
  const pendingItems = imageQueue.filter(x => x.status === 'pending');
  if (!pendingItems.length) return;

  const multiProgress = document.getElementById('multi-progress');
  const mpFill = document.getElementById('mp-bar-fill');
  const mpCount = document.getElementById('mp-count');
  const mpText = document.getElementById('mp-text');

  multiProgress.classList.remove('hidden');
  translateBtn.disabled = true;
  document.getElementById('error').classList.add('hidden');

  let done = 0;
  const total = pendingItems.length;
  const updateProgress = (status) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    mpFill.style.width = pct + '%';
    mpCount.textContent = `${done} / ${total}`;
    mpText.textContent = status;
  };
  updateProgress('Iniciando traducción…');

  // Parallel translation with concurrency pool (max 2 workers)
  const POPUP_CONCURRENCY = 2;
  let nextIdx = 0;
  async function popupWorker() {
    while (nextIdx < pendingItems.length) {
      const myIdx = nextIdx++;
      const item = pendingItems[myIdx];
      item.status = 'processing';
      renderQueue();
      updateProgress(`Traduciendo "${item.name}"…`);

      try {
        const result = await translateB64ViaBackground(item.b64);
        if (result.ok && result.data) {
          item.translatedSrc = result.data.translated_image;
          item.status = 'done';
        } else {
          item.status = 'error';
          item.error = result.error || 'traducción fallida';
        }
      } catch (e) {
        item.status = 'error';
        item.error = String(e.message || e);
      }

      done++;
      renderQueue();
      updateProgress(
        item.status === 'done'
          ? `✅ ${done}/${total} completadas`
          : `⚠️ Error en "${item.name}": ${item.error}`
      );
    }
  }

  await Promise.all(Array.from({ length: Math.min(POPUP_CONCURRENCY, pendingItems.length) }, () => popupWorker()));

  const errors = imageQueue.filter(x => x.status === 'error').length;
  const finalMsg = errors > 0
    ? `⚠️ Listo: ${done - errors}/${total} exitosas, ${errors} con error`
    : `✅ Listo: ${done}/${total} imágenes traducidas`;
  updateProgress(finalMsg);
  mpFill.style.width = '100%';

  const pendingLeft = imageQueue.filter(x => x.status === 'pending').length;
  translateBtn.disabled = (backendStatus === 'down' || pendingLeft === 0);
  if (pendingLeft > 0) {
    document.getElementById('translate-btn-text').textContent = `✨ Traducir ${pendingLeft} restante${pendingLeft !== 1 ? 's' : ''}`;
  } else {
    document.getElementById('translate-btn-text').textContent = '✨ Traducir imagen';
  }
}

// Promise wrapper for translate-blob via background
function translateB64ViaBackground(b64) {
  return new Promise((resolve) => {
    const reqId = 'ml-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    const handler = (msg) => {
      if (msg?.type !== 'translate-result' || msg.requestId !== reqId) return;
      chrome.runtime.onMessage.removeListener(handler);
      resolve({ ok: msg.ok, data: msg.data, error: msg.error });
    };
    chrome.runtime.onMessage.addListener(handler);

    chrome.runtime.sendMessage({ type: 'translate-blob', b64, options: {}, requestId: reqId }, () => {
      if (chrome.runtime.lastError) {
        chrome.runtime.onMessage.removeListener(handler);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      }
    });

    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve({ ok: false, error: 'Timeout (180s)' });
    }, 180000);
  });
}

// ── Page tab ──────────────────────────────────────────────────────────────
document.getElementById('translate-all-btn').addEventListener('click', () => {
  const btn = document.getElementById('translate-all-btn');
  const btnText = document.getElementById('translate-all-text');
  const status = document.getElementById('progress-status');
  btn.disabled = true; btnText.textContent = 'Enviando…';
  status.textContent = 'Enviando mensaje a la pestaña…';
  chrome.runtime.sendMessage({ type: 'translate-all-on-tab' }, () => {
    if (chrome.runtime.lastError) { status.textContent = '❌ ' + chrome.runtime.lastError.message; btn.disabled = false; btnText.textContent = '🚀 Reintentar'; }
  });
  setTimeout(() => { btnText.textContent = '✓ En progreso (ver barra en la página)'; status.textContent = '📍 El progreso se muestra en una barra flotante en la página.'; btn.disabled = false; btnText.textContent = '🚀 Volver a iniciar'; }, 1500);
});

async function loadActiveTabInfo() {
  const titleEl = document.getElementById('active-tab-title');
  const btn = document.getElementById('translate-all-btn');
  const btnText = document.getElementById('translate-all-text');
  const status = document.getElementById('progress-status');
  const count = document.getElementById('progress-count');
  titleEl.textContent = 'Verificando…'; btn.disabled = true; btnText.textContent = 'Verificando pestaña…';
  return new Promise(resolve => {
    let resolved = false;
    const handler = (msg) => {
      if (msg?.type !== 'tab-status-result' || resolved) return;
      resolved = true; chrome.runtime.onMessage.removeListener(handler);
      if (!msg.ok) { titleEl.textContent = '❌ Error'; status.textContent = '❌ ' + (msg.error || 'no se pudo verificar'); btn.disabled = true; btnText.textContent = 'No disponible'; return; }
      const data = msg.data;
      const title = data.title ? (data.title.length > 40 ? data.title.slice(0, 40) + '…' : data.title) : '(sin título)';
      titleEl.textContent = title;
      if (!data.isHttp) { status.textContent = `⚠️ Página interna.`; btn.disabled = true; btnText.textContent = '❌ No soportada'; count.textContent = '—'; return; }
      if (!data.canInject) { status.textContent = `❌ No se pudo inyectar.`; btn.disabled = true; btnText.textContent = '❌ No se puede inyectar'; return; }
      count.textContent = `${data.imageCount} páginas de manga`;
      if (data.imageCount === 0) { status.textContent = 'ℹ️ No se encontraron páginas de manga.'; btn.disabled = true; btnText.textContent = 'No hay páginas'; }
      else { status.textContent = `✅ ${data.imageCount} página(s) de manga detectada(s).`; btn.disabled = false; btnText.textContent = `🚀 Traducir ${data.imageCount} página(s)`; }
    };
    chrome.runtime.onMessage.addListener(handler);
    chrome.runtime.sendMessage({ type: 'check-tab-status' }, () => { if (chrome.runtime.lastError && !resolved) { resolved = true; chrome.runtime.onMessage.removeListener(handler); titleEl.textContent = '❌ Error'; status.textContent = '❌ No se pudo comunicar.'; btn.disabled = true; btnText.textContent = 'No disponible'; } });
    setTimeout(() => { if (!resolved) { resolved = true; chrome.runtime.onMessage.removeListener(handler); titleEl.textContent = '⏱️ Timeout'; status.textContent = '⏱️ El background no respondió en 5s.'; btn.disabled = true; btnText.textContent = 'No disponible'; } }, 5000);
  });
}

// ── Global message listener ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'translate-result') {
    const spinner = document.getElementById('spinner');
    const btnText = document.getElementById('translate-btn-text');
    spinner.classList.add('hidden'); translateBtn.disabled = false; btnText.textContent = '✨ Traducir imagen';
    if (imageQueue.length === 1) {
      if (msg.ok && msg.data) {
        document.getElementById('out-img').src = `data:image/png;base64,${msg.data.translated_image}`;
        document.getElementById('meta-text').textContent = `${msg.data.region_count} regiones · ${msg.data.processing_time_ms} ms`;
        document.getElementById('download-link').href = `data:image/png;base64,${msg.data.translated_image}`;
        showRegions(msg.data.regions || []);
        if (imageQueue[0]) { imageQueue[0].translatedSrc = msg.data.translated_image; imageQueue[0].status = 'done'; }
      } else { showError(msg.error || 'traducción fallida'); if (imageQueue[0]) imageQueue[0].status = 'error'; }
      renderQueue();
    }
    sendResponse({ ok: true }); return false;
  }
  if (msg?.type === 'translate-all-result') {
    const btn = document.getElementById('translate-all-btn');
    const btnText = document.getElementById('translate-all-text');
    const status = document.getElementById('progress-status');
    btn.disabled = false; btnText.textContent = '🚀 Traducir todas';
    if (!msg.ok) status.textContent = '❌ ' + msg.error;
    else status.textContent = '✅ Mensaje enviado.';
    sendResponse({ ok: true }); return false;
  }
  if (msg?.type === 'translate-all-progress') {
    const fill = document.getElementById('progress-fill');
    const count = document.getElementById('progress-count');
    const status = document.getElementById('progress-status');
    if (typeof msg.current === 'number' && typeof msg.total === 'number') { const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 0; fill.style.width = pct + '%'; count.textContent = `${msg.current} / ${msg.total}`; }
    if (msg.status) status.textContent = msg.status;
    sendResponse({ ok: true }); return false;
  }
  if (msg?.type === 'options-result') { for (const [rid, p] of _pendingReqs) { if (p.type === 'options') { _pendingReqs.delete(rid); if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error)); break; } } sendResponse({ ok: true }); return false; }
  if (msg?.type === 'settings-result') { for (const [rid, p] of _pendingReqs) { if (p.type === 'settings') { _pendingReqs.delete(rid); if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error)); break; } } sendResponse({ ok: true }); return false; }
  if (msg?.type === 'settings-saved') { for (const [rid, p] of _pendingReqs) { if (p.type === 'save') { _pendingReqs.delete(rid); p.resolve(); break; } } sendResponse({ ok: true }); return false; }
  return false;
});

// ── Async helpers ─────────────────────────────────────────────────────────
const _pendingReqs = new Map();
let _reqIdCounter = 0;
function _makeReqId() { return 'rq-' + (++_reqIdCounter) + '-' + Date.now(); }

function fetchOptionsAsync() {
  return new Promise((resolve, reject) => {
    const rid = _makeReqId();
    _pendingReqs.set(rid, { type: 'options', resolve, reject });
    chrome.runtime.sendMessage({ type: 'fetch-options' }, () => {
      if (chrome.runtime.lastError) { _pendingReqs.delete(rid); reject(new Error(chrome.runtime.lastError.message)); }
    });
    setTimeout(() => { if (_pendingReqs.has(rid)) { _pendingReqs.delete(rid); reject(new Error('timeout')); } }, 5000);
  });
}
function getSettingsAsync() {
  return new Promise((resolve, reject) => {
    const rid = _makeReqId();
    _pendingReqs.set(rid, { type: 'settings', resolve, reject });
    chrome.runtime.sendMessage({ type: 'get-settings' }, () => {
      if (chrome.runtime.lastError) { _pendingReqs.delete(rid); reject(new Error(chrome.runtime.lastError.message)); }
    });
    setTimeout(() => { if (_pendingReqs.has(rid)) { _pendingReqs.delete(rid); reject(new Error('timeout')); } }, 3000);
  });
}
function saveSettingsAsync(settings) {
  return new Promise((resolve, reject) => {
    const rid = _makeReqId();
    _pendingReqs.set(rid, { type: 'save', resolve, reject });
    chrome.runtime.sendMessage({ type: 'save-settings', settings }, () => {
      if (chrome.runtime.lastError) { _pendingReqs.delete(rid); reject(new Error(chrome.runtime.lastError.message)); }
    });
    setTimeout(() => { if (_pendingReqs.has(rid)) { _pendingReqs.delete(rid); reject(new Error('save timeout')); } }, 5000);
  });
}

// ── Backend health ────────────────────────────────────────────────────────
async function checkBackendHealth() {
  const chip = document.getElementById('status-chip');
  const text = document.getElementById('status-text');
  const settings = await getSettingsAsync().catch(() => ({ apiBase: DEFAULT_API }));
  const apiBase = (settings.apiBase || DEFAULT_API).trim();
  try {
    const r = await fetch(`${apiBase}/api/health`, { cache: 'no-store' });
    const data = await r.json();
    if (data.status === 'ok' || data.frontend === 'ok') {
      backendStatus = 'ok'; chip.className = 'status-chip status-ok'; text.textContent = '● Backend listo';
      translateBtn.disabled = imageQueue.filter(x => x.status === 'pending').length === 0;
    } else { backendStatus = 'down'; chip.className = 'status-chip status-down'; text.textContent = '● Backend caído'; translateBtn.disabled = true; }
  } catch (e) { backendStatus = 'down'; chip.className = 'status-chip status-down'; text.textContent = '● Sin backend'; translateBtn.disabled = true; }
}
checkBackendHealth(); setInterval(checkBackendHealth, 15000);

// ── Regions & helpers ─────────────────────────────────────────────────────
function showRegions(regions) { const wrap = document.getElementById('regions'); if (!regions.length) { wrap.classList.add('hidden'); return; } wrap.classList.remove('hidden'); const rows = regions.filter(r => r.source_text || r.translated_text).slice(0, 30).map(r => `<tr><td>${escapeHtml(r.source_text || '')}</td><td>→</td><td>${escapeHtml(r.translated_text || '')}</td></tr>`).join(''); wrap.innerHTML = `<table style="width:100%">${rows}</table>`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function showError(msg) { const el = document.getElementById('error'); el.textContent = msg; el.classList.remove('hidden'); }

// ── Translator section visibility ─────────────────────────────────────────
const MIMO_TRANSLATORS = new Set(['xiaomi']);

function updateTranslatorSections() {
  const translator = document.getElementById('s-translator').value;
  document.getElementById('mimo-section').classList.toggle('hidden', !MIMO_TRANSLATORS.has(translator));
  document.getElementById('ollama-section').classList.toggle('hidden', translator !== 'ollama');
  document.getElementById('groq-section').classList.toggle('hidden', translator !== 'groq');

  if (MIMO_TRANSLATORS.has(translator)) loadMimoModels();
  if (translator === 'ollama') loadOllamaModels();
}

// ── MiMo / Xiaomi: load available models via Token Plan API ──────────────
const MIMO_KNOWN_MODELS = [
  { id: 'mimo-v2.5-pro', label: 'MiMo v2.5 Pro ⭐ (mejor calidad)' },
  { id: 'mimo-v2.5',     label: 'MiMo v2.5 (rápido)' },
];

async function loadMimoModels(forceRefresh = false) {
  const tokenInput = document.getElementById('s-mimo-token');
  const select     = document.getElementById('s-mimo-model');
  const infoEl     = document.getElementById('mimo-info');
  const token      = tokenInput.value.trim();

  if (!token || !token.startsWith('tp-')) {
    select.innerHTML = '<option value="">— ingresá primero el token (tp-…) —</option>';
    infoEl.innerHTML = '<p>Token Plan (<code>tp-xxxxx</code>) · <a href="https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription" target="_blank" style="color:#d946ef">Suscripción ↗</a></p>';
    return;
  }

  select.innerHTML = '<option value="">Cargando modelos…</option>';
  infoEl.innerHTML = '<p>Verificando token con Xiaomi MiMo…</p>';

  const settings   = await getSettingsAsync().catch(() => ({}));
  const apiBase    = (settings.apiBase || DEFAULT_API).trim();
  const savedModel = settings.mimoModel || 'mimo-v2.5-pro';

  const endpoints = [
    apiBase + '/api/mimo/models',
    'https://token-plan-sgp.xiaomimimo.com/v1/models',
  ];

  let models = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token },
        cache: forceRefresh ? 'no-store' : 'default',
      });
      if (r.ok) {
        const data = await r.json();
        models = data.data || data.models || null;
        if (models) break;
      }
    } catch (_) {}
  }

  const displayModels = (models && models.length > 0)
    ? models.map(m => ({ id: m.id || m.name, label: m.id || m.name }))
    : MIMO_KNOWN_MODELS;

  select.innerHTML = displayModels.map(m =>
    '<option value="' + escapeHtml(m.id) + '" ' + (m.id === savedModel ? 'selected' : '') + '>' + escapeHtml(m.label || m.id) + '</option>'
  ).join('');

  if (!select.value && displayModels.length > 0) select.value = displayModels[0].id;

  const source = (models && models.length > 0) ? 'desde la API de Xiaomi' : 'modelos conocidos';
  infoEl.innerHTML =
    '<p>✅ ' + displayModels.length + ' modelo' + (displayModels.length !== 1 ? 's' : '') + ' disponible' + (displayModels.length !== 1 ? 's' : '') + ' (' + source + ').</p>' +
    '<p>Token Plan · <a href="https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription" target="_blank" style="color:#d946ef">Suscripción ↗</a></p>';
}

document.getElementById('mimo-refresh').addEventListener('click', () => loadMimoModels(true));
document.getElementById('s-mimo-token').addEventListener('blur', () => loadMimoModels(false));
document.getElementById('s-mimo-token').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadMimoModels(false);
});

// ── Ollama: load translation-capable models ───────────────────────────────
// Keywords that indicate a model can do text/translation tasks
const TRANSLATION_KEYWORDS = /llama|mistral|qwen|gemma|phi|orca|vicuna|wizard|hermes|deepseek|solar|yi\b|openchat|nous|mixtral|starling|neural|zephyr|smollm|command|aya|translate|multilingual/i;

async function loadOllamaModels(forceRefresh = false) {
  const select = document.getElementById('s-ollama-model');
  const infoEl = document.getElementById('ollama-info');
  const settings = await getSettingsAsync().catch(() => ({}));
  const apiBase = (settings.apiBase || DEFAULT_API).trim();

  select.innerHTML = '<option value="">Cargando…</option>';
  infoEl.innerHTML = '<p>Conectando a Ollama local…</p>';

  try {
    // Ollama exposes its own API at 11434, but also may be proxied through our backend
    const endpoints = [`${apiBase}/api/ollama/tags`, 'http://localhost:11434/api/tags'];
    let models = null;

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { cache: forceRefresh ? 'no-store' : 'default' });
        if (r.ok) {
          const data = await r.json();
          models = data.models || [];
          break;
        }
      } catch (_) {}
    }

    if (!models) throw new Error('No se pudo conectar a Ollama');

    if (models.length === 0) {
      select.innerHTML = '<option value="">No hay modelos instalados</option>';
      infoEl.innerHTML = '<p>⚠️ No tenés modelos instalados. Ejecutá <code>ollama pull llama3</code> o similar.</p>';
      return;
    }

    // Filter to models that are likely capable of translation
    const translationModels = models.filter(m => TRANSLATION_KEYWORDS.test(m.name || ''));
    const displayModels = translationModels.length > 0 ? translationModels : models;

    const savedModel = settings.ollamaModel || '';
    select.innerHTML = displayModels.map(m => {
      const sizeGB = m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '';
      const label = sizeGB ? `${m.name} (${sizeGB})` : m.name;
      return `<option value="${escapeHtml(m.name)}" ${m.name === savedModel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    const skipped = models.length - displayModels.length;
    infoEl.innerHTML = `
      <p>✅ ${displayModels.length} modelo${displayModels.length !== 1 ? 's' : ''} disponible${displayModels.length !== 1 ? 's' : ''} para traducción${skipped > 0 ? ` (${skipped} no relacionados omitidos)` : ''}.</p>
      ${translationModels.length === 0 ? '<p>⚠️ No se encontraron modelos de texto. Mostrando todos.</p>' : ''}
    `;
  } catch (e) {
    select.innerHTML = '<option value="">Error al conectar</option>';
    infoEl.innerHTML = `<p>❌ ${escapeHtml(String(e.message || e))}</p><p>¿Está Ollama corriendo? <code>ollama serve</code></p>`;
  }
}
document.getElementById('ollama-refresh').addEventListener('click', () => loadOllamaModels(true));

// ── Groq: load available models ───────────────────────────────────────────
const GROQ_TRANSLATION_KEYWORDS = /llama|mixtral|gemma|qwen|whisper/i;

async function loadGroqModels(forceRefresh = false) {
  const keyInput = document.getElementById('s-groq-key');
  const select = document.getElementById('s-groq-model');
  const apiKey = keyInput.value.trim();

  if (!apiKey || !apiKey.startsWith('gsk_')) {
    select.innerHTML = '<option value="">— ingresá una API Key válida (gsk_…) —</option>';
    return;
  }

  select.innerHTML = '<option value="">Cargando modelos…</option>';

  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: forceRefresh ? 'no-store' : 'default',
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${r.status}`);
    }
    const data = await r.json();
    const allModels = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));

    // Filter to text/chat models (not whisper audio, not tts)
    const textModels = allModels.filter(m =>
      !/(whisper|tts|embed|vision)/i.test(m.id) && GROQ_TRANSLATION_KEYWORDS.test(m.id)
    );
    const displayModels = textModels.length > 0 ? textModels : allModels.filter(m => !/whisper|tts|embed/i.test(m.id));

    const settings = await getSettingsAsync().catch(() => ({}));
    const savedModel = settings.groqModel || 'llama-3.3-70b-versatile';

    select.innerHTML = displayModels.map(m => {
      const ctxK = m.context_window ? ` · ${Math.round(m.context_window / 1000)}K ctx` : '';
      return `<option value="${escapeHtml(m.id)}" ${m.id === savedModel ? 'selected' : ''}>${escapeHtml(m.id)}${ctxK}</option>`;
    }).join('');

    if (!select.value && displayModels.length > 0) select.value = displayModels[0].id;
  } catch (e) {
    select.innerHTML = `<option value="">Error: ${escapeHtml(String(e.message || e))}</option>`;
  }
}

document.getElementById('groq-refresh').addEventListener('click', () => loadGroqModels(true));
document.getElementById('s-groq-key').addEventListener('blur', () => loadGroqModels(false));
document.getElementById('s-groq-key').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadGroqModels(false);
});

// ── Translator labels & settings ──────────────────────────────────────────
const TRANSLATOR_LABELS = {
  xiaomi: 'Xiaomi MiMo',
  groq: 'Groq (cloud)',
};
function translatorLabel(d) { return TRANSLATOR_LABELS[d.key] || d.name || d.key; }

async function loadSettings() {
  try {
    const s = await getSettingsAsync();
    const opts = await fetchOptionsAsync().catch(() => null);
    if (opts) {
      fillSelect('s-target-lang', opts.languages.map(l => [l.code, l.name]), s.targetLang);
      fillSelect('s-source-lang', opts.source_languages.map(l => [l.code, l.name === 'auto' ? 'Auto-detectar' : l.name]), s.sourceLang);
      fillSelect('s-detector', opts.detectors.map(d => [d.key, d.key + (d.heavy ? ' (heavy)' : '')]), s.detector);
      fillSelect('s-ocr', opts.ocrs.map(d => [d.key, d.key + (d.heavy ? ' (heavy)' : '')]), s.ocr);
      fillSelect('s-translator', opts.translators.map(d => [d.key, translatorLabel(d) + (d.needs_key ? ' (key)' : '') + (d.heavy ? ' (heavy)' : '')]), s.translator);
      fillSelect('s-inpainter', opts.inpainters.map(d => [d.key, d.key + (d.heavy ? ' (heavy)' : '')]), s.inpainter);
      fillSelect('s-renderer', opts.renderers.map(d => [d.key, d.key]), s.renderer);
      document.getElementById('s-font').value = s.fontFamily || 'anime_ace_3';
    }
    document.getElementById('s-api').value = s.apiBase || DEFAULT_API;
    document.getElementById('s-mimo-token').value = s.mimoToken || '';
    document.getElementById('s-groq-key').value = s.groqKey || '';

    // Pre-populate saved groq model
    if (s.groqModel) {
      const gSel = document.getElementById('s-groq-model');
      if (!Array.from(gSel.options).some(o => o.value === s.groqModel)) {
        const o = document.createElement('option'); o.value = s.groqModel; o.textContent = s.groqModel; o.selected = true; gSel.appendChild(o);
      } else { gSel.value = s.groqModel; }
    }

    // Pre-populate saved mimo model
    if (s.mimoModel) {
      const mSel = document.getElementById('s-mimo-model');
      if (!Array.from(mSel.options).some(o => o.value === s.mimoModel)) {
        const o = document.createElement('option'); o.value = s.mimoModel; o.textContent = s.mimoModel; o.selected = true; mSel.appendChild(o);
      } else { mSel.value = s.mimoModel; }
    }

    updateTranslatorSections();
  } catch (e) { console.warn('[MangaLingo] loadSettings failed:', e); }
}

function fillSelect(id, options, current) {
  const sel = document.getElementById(id); sel.innerHTML = '';
  options.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; if (v === current) o.selected = true; sel.appendChild(o); });
}

document.getElementById('s-translator').addEventListener('change', updateTranslatorSections);

document.getElementById('save-settings').addEventListener('click', async () => {
  const ollamaModel = document.getElementById('s-ollama-model').value;
  const groqModel = document.getElementById('s-groq-model').value;
  const mimoModel = document.getElementById('s-mimo-model').value;
  const settings = {
    targetLang: document.getElementById('s-target-lang').value,
    sourceLang: document.getElementById('s-source-lang').value,
    detector: document.getElementById('s-detector').value,
    ocr: document.getElementById('s-ocr').value,
    translator: document.getElementById('s-translator').value,
    inpainter: document.getElementById('s-inpainter').value,
    renderer: document.getElementById('s-renderer').value,
    fontFamily: document.getElementById('s-font').value,
    apiBase: document.getElementById('s-api').value.trim() || DEFAULT_API,
    mimoToken: document.getElementById('s-mimo-token').value.trim(),
    mimoModel: mimoModel || 'mimo-v2.5-pro',
    groqKey: document.getElementById('s-groq-key').value.trim(),
    groqModel: groqModel || 'llama-3.3-70b-versatile',
    ollamaModel: ollamaModel || '',
  };
  try { await saveSettingsAsync(settings); checkBackendHealth(); alert('✓ Ajustes guardados'); } catch (e) { alert('Error: ' + e.message); }
});

// ===== LinguaFlow Web Tab =====
(function () {
  const LF_PROVIDERS = {
    google: async (text, src, tgt) => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src === 'auto' ? 'auto' : src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Google gtx failed');
      const data = await res.json();
      if (data && data[0]) return data[0].map(s => s[0]).join('');
      throw new Error('Google parse failed');
    },
    mymemory: async (text, src, tgt) => {
      const langPair = `${src === 'auto' ? '' : src}|${tgt}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) return data.responseData.translatedText;
      throw new Error('MyMemory failed');
    },
  };

  async function lfTranslate(text, src, tgt) {
    for (const name of ['google', 'mymemory']) {
      try {
        const r = await LF_PROVIDERS[name](text, src, tgt);
        if (r && r.trim()) return { text: r, provider: name };
      } catch (_) {}
    }
    throw new Error('All providers failed');
  }

  async function lfStorageGet(keys) {
    return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
  }
  async function lfStorageSet(data) {
    return new Promise(resolve => chrome.storage.sync.set(data, resolve));
  }
  async function lfGetTab() {
    return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0])));
  }

  const lfSrc = document.getElementById('lf-src-lang');
  const lfTgt = document.getElementById('lf-tgt-lang');
  const lfSwap = document.getElementById('lf-swap');
  const lfInput = document.getElementById('lf-input');
  const lfCharCount = document.getElementById('lf-char-count');
  const lfResultCard = document.getElementById('lf-result-card');
  const lfResult = document.getElementById('lf-result');
  const lfStatus = document.getElementById('lf-status');
  const lfCopy = document.getElementById('lf-copy');
  const lfTranslatePage = document.getElementById('lf-translate-page');
  const lfRestorePage = document.getElementById('lf-restore-page');

  if (!lfSrc) return; // guard if elements missing

  // Load saved langs
  lfStorageGet(['lfSrcLang', 'lfTgtLang']).then(d => {
    if (d.lfSrcLang) lfSrc.value = d.lfSrcLang;
    if (d.lfTgtLang) lfTgt.value = d.lfTgtLang;
  });

  lfSrc.addEventListener('change', () => lfStorageSet({ lfSrcLang: lfSrc.value }));
  lfTgt.addEventListener('change', () => lfStorageSet({ lfTgtLang: lfTgt.value }));

  lfSwap.addEventListener('click', () => {
    if (lfSrc.value === 'auto') return;
    const tmp = lfSrc.value; lfSrc.value = lfTgt.value; lfTgt.value = tmp;
    lfStorageSet({ lfSrcLang: lfSrc.value, lfTgtLang: lfTgt.value });
  });

  lfInput.addEventListener('input', () => {
    const len = lfInput.value.length;
    lfCharCount.textContent = `${len} / 5000`;
    lfCharCount.style.color = len > 5000 ? '#f87171' : '#666';
  });

  async function doLfTranslateText() {
    const text = lfInput.value.trim();
    if (!text || text.length > 5000) return;
    lfStatus.textContent = 'Traduciendo…';
    lfStatus.style.color = '#8b95a5';
    lfResultCard.style.display = 'block';
    lfResult.textContent = '…';
    try {
      const { text: translated, provider } = await lfTranslate(text, lfSrc.value, lfTgt.value);
      lfResult.textContent = translated;
      const names = { google: 'Google', mymemory: 'MyMemory' };
      lfStatus.textContent = `✓ ${names[provider] || provider}`;
      lfStatus.style.color = '#4ade80';
    } catch (_) {
      lfResult.textContent = 'Error: no se pudo traducir.';
      lfStatus.textContent = 'Error';
      lfStatus.style.color = '#f87171';
    }
  }

  lfInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && lfInput.value.trim()) {
      e.preventDefault();
      doLfTranslateText();
    }
  });

  lfTranslatePage.addEventListener('click', async () => {
    lfTranslatePage.disabled = true;
    lfTranslatePage.textContent = 'Traduciendo…';
    try {
      const tab = await lfGetTab();
      // Inject LinguaFlow content script if not yet present
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lf_content.js'],
      }).catch(() => {}); // already injected → ignore error
      await chrome.tabs.sendMessage(tab.id, {
        action: 'lf_translatePage',
        srcLang: lfSrc.value,
        tgtLang: lfTgt.value,
      });
      lfStatus.textContent = '✓ Página traducida';
      lfStatus.style.color = '#4ade80';
      lfResultCard.style.display = 'block';
    } catch (e) {
      lfStatus.textContent = 'Error: recargá la pestaña';
      lfStatus.style.color = '#f87171';
      lfResultCard.style.display = 'block';
    }
    lfTranslatePage.textContent = '🌐 Traducir página activa';
    lfTranslatePage.disabled = false;
  });

  lfRestorePage.addEventListener('click', async () => {
    try {
      const tab = await lfGetTab();
      await chrome.tabs.sendMessage(tab.id, { action: 'lf_restorePage' });
      lfStatus.textContent = '✓ Original restaurado';
      lfStatus.style.color = '#4ade80';
    } catch (_) {
      lfStatus.textContent = 'Nada para restaurar';
      lfStatus.style.color = '#8b95a5';
    }
    lfResultCard.style.display = 'block';
  });

  lfCopy.addEventListener('click', async () => {
    const t = lfResult.textContent;
    if (!t || t === '…') return;
    try {
      await navigator.clipboard.writeText(t);
      lfCopy.textContent = 'Copiado ✓';
      setTimeout(() => { lfCopy.textContent = 'Copiar'; }, 1500);
    } catch (_) {}
  });
})();
