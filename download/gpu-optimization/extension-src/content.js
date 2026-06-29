/* MangaLingo — content script (v1.13.0)
 *
 * Cambios v1.11.0:
 *  - Mejor manejo de CDNs sin CORS: fallback optimizado via background worker
 *  - Errores más claros cuando el servidor de imágenes bloquea el acceso
 *  - overlayError con más tiempo visible y console.error
 *
 * Cambios v1.10.0:
 *  - Filtro inteligente de imágenes: solo traduce páginas de manga reales
 *  - Detecta manga pages por: aspect ratio vertical, tamaño grande, container
 *  - Ignora logos, banners, ads, avatares, thumbnails
 *  - CONCURRENCY=2 con cleanup_vram() del backend
 */

(function () {
  if (window.__mangaLingoInjected) return;
  window.__mangaLingoInjected = true;

  let lastHovered = null;
  document.addEventListener(
    'mouseover',
    (e) => { if (e.target instanceof HTMLImageElement) lastHovered = e.target; },
    { passive: true, capture: true },
  );

  const pendingByReqId = new Map();
  let batchState = null;

  // ---------- Settings cache ----------
  let cachedSettings = null;
  async function getSettings() {
    if (cachedSettings) return cachedSettings;
    try {
      const s = await chrome.storage.sync.get({
        apiBase: 'http://localhost:3000',
        targetLang: 'es', sourceLang: 'auto',
        detector: 'ctd', ocr: 'manga_ocr', translator: 'groq',
        inpainter: 'lama', renderer: 'manga2eng',
        fontFamily: 'anime_ace_3', fontSize: 0,
        mimoToken: '', mimoModel: 'mimo-v2.5-pro',
        groqKey: '', groqModel: 'llama-3.3-70b-versatile',
        ollamaModel: '',
      });
      cachedSettings = s;
      return s;
    } catch (_) {
      return {
        apiBase: 'http://localhost:3000',
        targetLang: 'es', sourceLang: 'auto',
        detector: 'ctd', ocr: 'manga_ocr', translator: 'groq',
        inpainter: 'lama', renderer: 'manga2eng',
        fontFamily: 'anime_ace_3', fontSize: 0,
        mimoToken: '', mimoModel: 'mimo-v2.5-pro',
        groqKey: '', groqModel: 'llama-3.3-70b-versatile',
        ollamaModel: '',
      };
    }
  }

  // ⚡ Invalidate settings cache when user saves settings (so font changes take effect immediately)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'settings-saved') { cachedSettings = null; }
  });

  // ---------- ⚡ SMART MANGA PAGE DETECTION (v1.10.0) ----------

  /**
   * Determina si una imagen es una página de manga real.
   * Criterios (deben cumplir TODOS):
   *   1. Tamaño grande (>= 400x500 px)
   *   2. Aspect ratio vertical (height > width) — los manga son retrato
   *   3. No es un logo/banner/ad (no está en <header>, <nav>, <aside>)
   *   4. No tiene atributos de ad (data-ad, class*="ad-", id*="banner")
   *   5. No es un avatar/icono (src contiene "avatar", "icon", "logo", "thumb")
   *
   * Criterios adicionales (basta con 1):
   *   - El parent container tiene class/id con "manga", "chapter", "page", "reader"
   *   - La URL de la imagen contiene patrones típicos de CDN de manga
   *   - La imagen es muy alta (> 800px) — típico de páginas de manga
   */
  function isMangaPage(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;

    // 1. Tamaño mínimo
    if (w < 400 || h < 500) return false;

    // 2. Aspect ratio vertical (manga es retrato)
    // Permitimos hasta 1:1.2 (casi cuadrado) pero preferimos vertical
    const ratio = h / w;
    if (ratio < 1.0) return false; // horizontal → no es manga

    // 3. No en header/nav/aside/footer (áreas de UI)
    let parent = img.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const tag = parent.tagName?.toLowerCase();
      if (tag === 'header' || tag === 'nav' || tag === 'aside' || tag === 'footer') {
        return false;
      }
      depth++;
      parent = parent.parentElement;
    }

    // 4. No tiene atributos de ad
    const cls = (img.className || '') + ' ' + (img.parentElement?.className || '');
    const id = (img.id || '') + ' ' + (img.parentElement?.id || '');
    const adPatterns = /(\bad-\b|banner|advert|sponsor|google-ad|adsbygoogle)/i;
    if (adPatterns.test(cls) || adPatterns.test(id)) return false;

    // 5. No es avatar/icono/logo
    const src = (img.src || '').toLowerCase();
    const skipPatterns = /(avatar|icon|logo|thumb|favicon|button|emoji|smiley|badge)/i;
    if (skipPatterns.test(src)) return false;

    // --- Criterios positivos (basta con 1) ---

    // A. Container con class/id de manga reader
    parent = img.parentElement;
    depth = 0;
    while (parent && depth < 5) {
      const parentCls = (parent.className || '') + ' ' + (parent.id || '');
      if (/manga|chapter|page|reader|comic|panel|page-content/i.test(parentCls)) {
        return true; // ✅ está en un container de manga
      }
      depth++;
      parent = parent.parentElement;
    }

    // B. URL típica de CDN de manga
    const cdnPatterns = /(kumacdn|mangadex|cdn\.|wp-content\/uploads|manga|chapter|page\/)/i;
    if (cdnPatterns.test(src)) return true;

    // C. Imagen muy alta (típico de página de manga full)
    if (h > 800 && ratio > 1.2) return true;

    // D. Si pasa todos los filtros negativos Y es grande Y vertical
    // → probablemente es manga
    if (w >= 600 && h >= 800 && ratio > 1.1) return true;

    // Si no cumple ninguno de los positivos, no la traducimos
    return false;
  }

  /**
   * Cuenta cuántas imágenes de manga hay en la página.
   */
  function countMangaImages() {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.filter(isMangaPage).length;
  }

  // ---------- Single image translate ----------
  async function translateImg(img) {
    if (!img || !img.src) return;
    overlayLoading(img);
    try {
      const b64 = await imageUrlToBase64(img.src);
      const data = await translateBase64Direct(b64);
      if (data?.success && data.translated_image) {
        if (!img.dataset.mtOriginal) img.dataset.mtOriginal = img.src;
        // ⚡ Auto-detect format: JPEG b64 starts with '/' (/9j...), PNG starts with 'i' (iVBOR...)
        const fmt = data.translated_image.charAt(0) === '/' ? 'jpeg' : 'png';
        img.src = `data:image/${fmt};base64,${data.translated_image}`;
        removeOverlay(img);
        showResultBadge(img, data);
      } else {
        overlayError(img, data?.error || 'traducción fallida');
      }
    } catch (e) {
      overlayError(img, String(e.message || e));
    }
  }

  // ---------- Batch translate (optimizado v1.15: API batch + Groq/Xiaomi/Ollama) ----------

  const API_TRANSLATORS = new Set(['groq', 'xiaomi', 'google']);

  async function getTranslatorSetting() {
    try {
      const s = await chrome.storage.sync.get({ translator: 'groq' });
      return s.translator || 'groq';
    } catch (_) {
      return 'groq';
    }
  }

  async function translateAll() {
    if (batchState && batchState.running) return;

    const imgs = Array.from(document.querySelectorAll('img'));
    const candidates = imgs.filter(isMangaPage);

    if (candidates.length === 0) {
      showProgressBar(0, 0, 'No se encontraron páginas de manga en esta página.');
      setTimeout(() => hideProgressBar(), 3000);
      return;
    }

    if (candidates.length > 50) {
      if (!confirm(`Se encontraron ${candidates.length} páginas. Máximo 50 por batch. ¿Traducir las primeras 50?`)) return;
      candidates.length = 50;
    } else if (candidates.length > 25) {
      if (!confirm(`Se encontraron ${candidates.length} páginas de manga. ¿Traducir todas?`)) return;
    }

    batchState = {
      total: candidates.length,
      done: 0,
      failed: 0,
      running: true,
      aborted: false,
      startedAt: Date.now(),
      firstError: null,
    };

    candidates.forEach(overlayLoading);
    showProgressBar(0, batchState.total, `Preparando ${batchState.total} imágenes…`);

    try {
      // Convert images to base64 with bounded concurrency (max 4 at a time)
      const CONVERT_CONCURRENCY = 4;
      const pairs = [];
      for (let ci = 0; ci < candidates.length; ci += CONVERT_CONCURRENCY) {
        const chunk = candidates.slice(ci, ci + CONVERT_CONCURRENCY);
        const chunkResults = await Promise.all(
          chunk.map(async (img) => {
            try {
              return { img, b64: await imageUrlToBase64(img.src) };
            } catch (e) {
              return { img, b64: null, error: String(e.message || e) };
            }
          })
        );
        pairs.push(...chunkResults);
      }

      if (batchState.aborted) return;

      const valid = pairs.filter((p) => p.b64);
      const invalid = pairs.filter((p) => !p.b64);
      for (const p of invalid) {
        batchState.failed++;
        batchState.done++;
        overlayError(p.img, p.error || 'no se pudo leer imagen');
      }

      if (valid.length >= 1) {
        showProgressBar(batchState.done, batchState.total, `Traduciendo ${valid.length} páginas (paralelo)…`);
        
        // Parallel individual requests — each image is ~1-2MB, well under the 10MB limit
        const PARALLEL = 3;
        const settings = await getSettings();
        const apiBase = getApiBase();
        
        let nextIdx = 0;
        async function worker() {
          while (nextIdx < valid.length && !batchState.aborted) {
            const myIdx = nextIdx++;
            if (myIdx >= valid.length) break;
            const { img, b64 } = valid[myIdx];
            try {
              const t0 = Date.now();
              const data = await translateBase64Direct(b64);
              const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
              if (data?.success && data.translated_image) {
                if (!img.dataset.mtOriginal) img.dataset.mtOriginal = img.src;
                // ⚡ Auto-detect format: JPEG b64 starts with '/9j...', PNG with 'iVBOR'
                const fmt = data.translated_image.charAt(0) === '/' ? 'jpeg' : 'png';
                img.src = `data:image/${fmt};base64,${data.translated_image}`;
                removeOverlay(img);
                showResultBadge(img, data);
              } else {
                throw new Error(data?.error || 'traducción fallida');
              }
              batchState.done++;
              showProgressBar(batchState.done, batchState.total,
                `${batchState.done}/${batchState.total} · ${elapsed}s`);
            } catch (e) {
              batchState.done++;
              batchState.failed++;
              if (!batchState.firstError) batchState.firstError = String(e.message || e);
              overlayError(img, String(e.message || e));
              showProgressBar(batchState.done, batchState.total,
                `${batchState.done}/${batchState.total} ⚠️`);
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(PARALLEL, valid.length) }, () => worker()));
        
      }
    } catch (e) {
      if (!batchState.aborted) {
        batchState.firstError = String(e.message || e);
        candidates.forEach((img) => overlayError(img, batchState.firstError));
        batchState.failed = candidates.length;
        batchState.done = candidates.length;
        showProgressBar(batchState.total, batchState.total, `❌ Error: ${batchState.firstError}`, true);
      }
    }

    batchState.running = false;
    const elapsed = (Date.now() - batchState.startedAt) / 1000;
    const finalStatus = batchState.failed > 0
      ? `⚠️ Listo: ${batchState.done}/${batchState.total} (${batchState.failed} fallidas) en ${formatTime(elapsed)}`
      : `✅ Listo: ${batchState.done}/${batchState.total} páginas en ${formatTime(elapsed)}`;
    showProgressBar(batchState.done, batchState.total, finalStatus, true);
    chrome.runtime.sendMessage({
      type: 'translate-all-progress',
      current: batchState.done,
      total: batchState.total,
      status: finalStatus,
    }).catch(() => {});
  }

  /** Fallback: workers paralelos imagen a imagen */
  async function translateAllLegacyWorkers(candidates) {
    const translator = await getTranslatorSetting();
    const CONCURRENCY = API_TRANSLATORS.has(translator) ? 4 : 2;
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 10000;
    let nextIndex = 0;

    async function worker() {
      while (batchState.running && !batchState.aborted && nextIndex < candidates.length) {
        const myIdx = nextIndex++;
        const img = candidates[myIdx];
        if (!img) continue;
        overlayLoading(img);
        let success = false;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
          if (batchState.aborted) return;
          try {
            const b64 = await imageUrlToBase64(img.src);
            const data = await translateBase64Direct(b64);
            if (batchState.aborted) return;
            if (!img.dataset.mtOriginal) img.dataset.mtOriginal = img.src;
              const fmt2 = data.translated_image.charAt(0) === '/' ? 'jpeg' : 'png';
              img.src = `data:image/${fmt2};base64,${data.translated_image}`;
              removeOverlay(img);
              showResultBadge(img, data);
            success = true;
            break;
          } catch (e) {
            lastError = String(e.message || e);
            if (attempt <= MAX_RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY));
            else break;
          }
        }

        if (!success) {
          if (!batchState.firstError) batchState.firstError = lastError;
          overlayError(img, lastError || 'traducción fallida');
          batchState.failed++;
        }
        batchState.done++;
        const elapsed = (Date.now() - batchState.startedAt) / 1000;
        const rate = batchState.done / Math.max(1, elapsed);
        showProgressBar(batchState.done, batchState.total,
          `${batchState.done}/${batchState.total} · ${rate.toFixed(2)} p/s`);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  }

  function abortBatch() {
    if (batchState) {
      batchState.aborted = true;
      batchState.running = false;
      showProgressBar(batchState.done, batchState.total, `⏹ Detenido (${batchState.done}/${batchState.total})`, true);
    }
  }

  function formatTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  }

  // ---------- Direct API call via background worker port (no CORS issues, no 64KB limit) ----------

  function getApiBase() {
    const s = cachedSettings || {};
    return (s.apiBase || 'http://localhost:3000').replace(/\/+$/, '');
  }

  // Persistent port to background for large payloads
  let _bgPort = null;
  const _portPending = new Map();

  function _ensurePort() {
    if (_bgPort) return _bgPort;
    _bgPort = chrome.runtime.connect({ name: 'translate-single' });
    _bgPort.onMessage.addListener((msg) => {
      if (msg.type === 'result' && msg.reqId && _portPending.has(msg.reqId)) {
        const { resolve, reject } = _portPending.get(msg.reqId);
        _portPending.delete(msg.reqId);
        if (msg.ok) resolve(msg.data);
        else reject(new Error(msg.error || 'background error'));
      }
    });
    _bgPort.onDisconnect.addListener(() => {
      _bgPort = null;
      // Reject all pending
      for (const [, { reject }] of _portPending) reject(new Error('port disconnected'));
      _portPending.clear();
    });
    return _bgPort;
  }

  async function translateBase64Direct(b64, options = {}) {
    const port = _ensurePort();
    const reqId = 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    return new Promise((resolve, reject) => {
      _portPending.set(reqId, { resolve, reject });
      const timer = setTimeout(() => {
        if (_portPending.has(reqId)) {
          _portPending.delete(reqId);
          reject(new Error('timeout (180s)'));
        }
      }, 180000);
      _portPending.set(reqId, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      port.postMessage({ type: 'translate', b64, options, reqId });
    });
  }

  function translateBatchStreamViaBackground(b64List, options = {}, onProgress) {
    return new Promise((resolve, reject) => {
      const reqId = 'ml-batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      
      const handler = (msg) => {
        if (msg?.requestId !== reqId) return;
        if (msg.type === 'translate-batch-progress') {
          onProgress(msg.data);
        } else if (msg.type === 'translate-batch-result') {
          chrome.runtime.onMessage.removeListener(handler);
          if (msg.ok) resolve(msg.data);
          else reject(new Error(msg.error || 'error en background'));
        }
      };
      chrome.runtime.onMessage.addListener(handler);
      
      chrome.runtime.sendMessage({ type: 'translate-batch-stream', images: b64List, options, requestId: reqId }, () => {
        if (chrome.runtime.lastError) {
          chrome.runtime.onMessage.removeListener(handler);
          reject(new Error(chrome.runtime.lastError.message));
        }
      });
    });
  }

  // ---------- Image helpers ----------

  async function imageUrlToBase64(url) {
    if (url.startsWith('data:')) return url.split(',')[1];

    // 1) Canvas (same-origin / CORS-enabled servers)
    try {
      const img = await loadImg(url);
      const canvas = document.createElement('canvas');
      // Usar resolución original para que el servidor calcule el tamaño
      // de fuente correctamente relativo a las dimensiones reales de la imagen.
      // Solo comprimimos imágenes extremadamente grandes (> 4096px) para
      // evitar timeouts, pero mantenemos la relación de aspecto exacta.
      const MAX_DIM = 4096;
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      return dataUrl.split(',')[1];
    } catch (_) {
      // canvas tainted → fall through to background proxy
    }

    // 2) Background worker (host permissions bypass CORS in MV3)
    return new Promise((resolve, reject) => {
      const reqId = 'mt-fetch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(handler);
        reject(new Error('timeout descargando imagen (30s)'));
      }, 30000);
      const handler = (msg) => {
        if (msg?.type !== 'fetch-image-result' || msg.requestId !== reqId) return;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
        if (msg.ok && msg.b64) resolve(msg.b64);
        else reject(new Error(msg.error || 'no se pudo descargar imagen'));
      };
      chrome.runtime.onMessage.addListener(handler);
      chrome.runtime.sendMessage(
        { type: 'fetch-image', url, requestId: reqId },
        () => {
          if (chrome.runtime.lastError) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(handler);
            reject(new Error(chrome.runtime.lastError.message));
          }
        }
      );
    });
  }

  function loadImg(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }

  // ---------- Progress bar ----------

  function ensureProgressBar() {
    let bar = document.getElementById('mangalingo-progress-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'mangalingo-progress-bar';
    bar.className = 'mt-progress-bar';
    bar.innerHTML = `
      <div class="mt-pb-header">
        <div class="mt-pb-title">
          <span class="mt-pb-logo">M</span>
          <span class="mt-pb-name">MangaLingo</span>
          <span class="mt-pb-counter">0 / 0</span>
        </div>
        <div class="mt-pb-actions">
          <button class="mt-pb-abort" title="Detener">✕</button>
        </div>
      </div>
      <div class="mt-pb-track"><div class="mt-pb-fill" style="width: 0%"></div></div>
      <div class="mt-pb-status">Iniciando…</div>
    `;
    document.body.appendChild(bar);
    bar.querySelector('.mt-pb-abort').addEventListener('click', abortBatch);
    return bar;
  }

  let autoHideTimer = null;
  function showProgressBar(done, total, status, isFinal = false) {
    const bar = ensureProgressBar();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    bar.querySelector('.mt-pb-counter').textContent = `${done} / ${total}`;
    bar.querySelector('.mt-pb-fill').style.width = pct + '%';
    bar.querySelector('.mt-pb-status').textContent = status;
    bar.classList.toggle('mt-pb-final', isFinal);
    bar.classList.add('mt-pb-visible');
    if (isFinal && autoHideTimer) clearTimeout(autoHideTimer);
    if (isFinal) {
      autoHideTimer = setTimeout(() => {
        const b = document.getElementById('mangalingo-progress-bar');
        if (b) {
          b.classList.remove('mt-pb-visible');
          setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 400);
        }
      }, 8000);
    }
  }

  function hideProgressBar() {
    const bar = document.getElementById('mangalingo-progress-bar');
    if (bar) bar.classList.remove('mt-pb-visible');
  }

  // ---------- Per-image overlays ----------

  function uniqueId() { return 'mt-' + Math.random().toString(36).slice(2, 9); }

  function overlayLoading(img) {
    removeOverlay(img);
    const id = uniqueId();
    const wrap = document.createElement('div');
    wrap.className = 'mt-overlay mt-loading';
    wrap.id = id;
    wrap.innerHTML = '<div class="mt-spinner"></div><div class="mt-text">Traduciendo…</div>';
    positionOverlay(wrap, img);
    document.body.appendChild(wrap);
    img.dataset.mtOverlay = id;
  }

  function overlayError(img, msg) {
    removeOverlay(img);
    console.error(`[MangaLingo] Error en imagen: ${msg}`);
    const id = uniqueId();
    const wrap = document.createElement('div');
    wrap.className = 'mt-overlay mt-error';
    wrap.id = id;
    wrap.innerHTML = `<div class="mt-text">⚠️ ${escapeHtml(msg.substring(0, 120))}</div>`;
    positionOverlay(wrap, img);
    document.body.appendChild(wrap);
    img.dataset.mtOverlay = id;
    setTimeout(() => removeOverlay(img), 8000);
  }

  function showResultBadge(img, data) {
    const badge = document.createElement('div');
    badge.className = 'mt-overlay mt-badge';
    badge.innerHTML = `<div class="mt-text">✓ ${data.region_count || '?'} regiones · <a class="mt-revert">revertir</a></div>`;
    positionOverlay(badge, img);
    document.body.appendChild(badge);
    img.dataset.mtOverlay = badge.id = uniqueId();
    badge.querySelector('.mt-revert')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (img.dataset.mtOriginal) img.src = img.dataset.mtOriginal;
      delete img.dataset.mtOriginal;
      badge.remove();
    });
    setTimeout(() => badge.classList.add('mt-fade'), 4000);
    setTimeout(() => badge.remove(), 9000);
  }

  function removeOverlay(img) {
    const id = img.dataset.mtOverlay;
    if (id) { document.getElementById(id)?.remove(); delete img.dataset.mtOverlay; }
  }

  function positionOverlay(el, img) {
    const rect = img.getBoundingClientRect();
    el.style.left = `${window.scrollX + rect.left + 12}px`;
    el.style.top = `${window.scrollY + rect.top + 12}px`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  let raf = 0;
  function repositionAll() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      document.querySelectorAll('.mt-overlay').forEach((el) => el.classList.add('mt-fade'));
    });
  }
  window.addEventListener('scroll', repositionAll, { passive: true });
  window.addEventListener('resize', repositionAll);

  // ---------- Message handler ----------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'ping') { sendResponse({ ok: true, pong: true }); return false; }

    // ⚡ Usar el filtro inteligente para contar
    if (msg?.type === 'count-images') {
      const count = countMangaImages();
      sendResponse({ ok: true, count, total: document.querySelectorAll('img').length });
      return false;
    }

    if (msg?.type === 'translate-one' && msg.srcUrl) {
      try {
        const img = document.querySelector(`img[src="${CSS.escape(msg.srcUrl)}"]`);
        if (img) translateImg(img);
      } catch (e) {}
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type === 'translate-all') { translateAll(); sendResponse({ ok: true }); return false; }
    if (msg?.type === 'translate-abort') { abortBatch(); sendResponse({ ok: true }); return false; }
    if (msg?.type === 'translate-hovered') {
      if (lastHovered) translateImg(lastHovered);
      else alert('Pasa el cursor por encima de una imagen primero');
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type === 'translate-result') {
      let img = null;
      if (msg.requestId && pendingByReqId.has(msg.requestId)) {
        img = pendingByReqId.get(msg.requestId);
        pendingByReqId.delete(msg.requestId);
      } else if (pendingByReqId.size > 0) {
        const oldestReqId = pendingByReqId.keys().next().value;
        img = pendingByReqId.get(oldestReqId);
        pendingByReqId.delete(oldestReqId);
      }
      if (img) {
        if (msg.ok && msg.data) {
          if (!img.dataset.mtOriginal) img.dataset.mtOriginal = img.src;
          const fmt3 = (msg.data.translated_image || '').charAt(0) === '/' ? 'jpeg' : 'png';
          img.src = `data:image/${fmt3};base64,${msg.data.translated_image}`;
          removeOverlay(img);
          showResultBadge(img, msg.data);
        } else {
          overlayError(img, msg.error || 'traducción fallida');
        }
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  console.log('[MangaLingo] content script ready v1.13.0 (JPEG auto-detect + settings cache fix)');
})();
