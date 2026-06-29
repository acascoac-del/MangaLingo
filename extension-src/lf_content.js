(() => {
  if (window.__linguaFlowLoaded2) return;
  window.__linguaFlowLoaded2 = true;

  const extApi = typeof browser !== 'undefined' ? browser : chrome;
  const originalTexts = new Map();
  let isTranslated = false;

  const PROVIDERS = {
    google: async (text, src, tgt) => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src === 'auto' ? 'auto' : src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Google gtx failed');
      const data = await res.json();
      if (data && data[0]) return data[0].map((s) => s[0]).join('');
      throw new Error('Google gtx parse failed');
    },
    mymemory: async (text, src, tgt) => {
      const langPair = `${src === 'auto' ? '' : src}|${tgt}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) return data.responseData.translatedText;
      throw new Error('MyMemory failed');
    },
    libre: async (text, src, tgt) => {
      const endpoints = ['https://libretranslate.com/translate', 'https://translate.argosopentext.com/translate'];
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, source: src === 'auto' ? 'auto' : src, target: tgt, format: 'text' }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.translatedText) return data.translatedText;
          }
        } catch (_) {}
      }
      throw new Error('LibreTranslate failed');
    },
  };

  async function storageGet(keys) {
    if (extApi.storage?.sync?.get.length <= 1) return extApi.storage.sync.get(keys);
    return new Promise((resolve) => extApi.storage.sync.get(keys, resolve));
  }

  async function translateText(text, src, tgt) {
    for (const name of ['google', 'mymemory', 'libre']) {
      try {
        const result = await PROVIDERS[name](text, src, tgt);
        if (result && result.trim()) return result;
      } catch (_) {}
    }
    return text;
  }

  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','KBD','SAMP','VAR','TEXTAREA','INPUT','SELECT','SVG','MATH','IFRAME','CANVAS','VIDEO','AUDIO','IMG','BR','HR','META','LINK','TITLE']);

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('code, pre, script, style, svg, math, textarea, input, [contenteditable]')) return NodeFilter.FILTER_REJECT;
        const text = node.textContent.trim();
        if (text.length < 2) return NodeFilter.FILTER_REJECT;
        if (!/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function batchTexts(nodes, maxBatchSize = 4200) {
    const batches = [];
    let currentTexts = [];
    let currentNodes = [];
    let currentLength = 0;
    for (const node of nodes) {
      const text = node.textContent.trim();
      if (currentLength + text.length + 1 > maxBatchSize && currentTexts.length) {
        batches.push({ texts: currentTexts, nodes: currentNodes });
        currentTexts = [];
        currentNodes = [];
        currentLength = 0;
      }
      currentTexts.push(text);
      currentNodes.push(node);
      currentLength += text.length + 1;
    }
    if (currentTexts.length) batches.push({ texts: currentTexts, nodes: currentNodes });
    return batches;
  }

  function showProgress(current, total) {
    let bar = document.getElementById('__lf_progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = '__lf_progress';
      bar.innerHTML = '<div id="__lf_progress_fill"></div>';
      document.body.appendChild(bar);
    }
    const fill = document.getElementById('__lf_progress_fill');
    fill.style.width = `${Math.round((current / total) * 100)}%`;
    if (current >= total) {
      setTimeout(() => bar?.classList.add('done'), 300);
      setTimeout(() => bar?.remove(), 900);
    }
  }

  async function translateAttributes(srcLang, tgtLang) {
    const attrNodes = document.querySelectorAll('[title], [alt], [placeholder]');
    for (const el of attrNodes) {
      for (const attr of ['title', 'alt', 'placeholder']) {
        const val = el.getAttribute(attr);
        if (val && val.trim().length > 2) {
          try {
            const translated = await translateText(val, srcLang, tgtLang);
            el.setAttribute(`data-lf-orig-${attr}`, val);
            el.setAttribute(attr, translated);
          } catch (_) {}
        }
      }
    }
  }

  async function restorePage() {
    for (const [node, original] of originalTexts) {
      if (node.parentElement) node.textContent = original;
    }
    originalTexts.clear();
    document.querySelectorAll('[data-lf-orig-title]').forEach((el) => {
      el.setAttribute('title', el.getAttribute('data-lf-orig-title'));
      el.removeAttribute('data-lf-orig-title');
    });
    document.querySelectorAll('[data-lf-orig-alt]').forEach((el) => {
      el.setAttribute('alt', el.getAttribute('data-lf-orig-alt'));
      el.removeAttribute('data-lf-orig-alt');
    });
    document.querySelectorAll('[data-lf-orig-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', el.getAttribute('data-lf-orig-placeholder'));
      el.removeAttribute('data-lf-orig-placeholder');
    });
    isTranslated = false;
  }

  async function translatePage(srcLang, tgtLang) {
    if (isTranslated) await restorePage();
    const textNodes = getTextNodes(document.body);
    if (!textNodes.length) return;
    originalTexts.clear();
    for (const node of textNodes) originalTexts.set(node, node.textContent);
    const batches = batchTexts(textNodes);
    let processed = 0;

    for (const batch of batches) {
      try {
        const separator = '\n\u200B';
        const combined = batch.texts.join(separator);
        const translated = await translateText(combined, srcLang, tgtLang);
        const parts = translated.split(separator);
        if (parts.length === batch.nodes.length) {
          batch.nodes.forEach((node, i) => { node.textContent = parts[i]; });
        } else {
          for (let i = 0; i < batch.nodes.length; i++) {
            batch.nodes[i].textContent = await translateText(batch.texts[i], srcLang, tgtLang);
          }
        }
      } catch (_) {}

      processed += batch.nodes.length;
      showProgress(processed, textNodes.length);
      await new Promise((r) => setTimeout(r, 150));
    }

    isTranslated = true;
    await translateAttributes(srcLang, tgtLang);
  }

  extApi.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'lf_translatePage') {
      translatePage(msg.srcLang, msg.tgtLang).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg.action === 'lf_restorePage') {
      restorePage().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg.action === 'lf_translateSelection') {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        translateText(sel.toString().trim(), msg.srcLang, msg.tgtLang).then((translated) => sendResponse({ translated }));
        return true;
      }
    }
    return false;
  });

  let selectionBubble = null;

  function removeBubble() {
    selectionBubble?.remove();
    selectionBubble = null;
  }

  document.addEventListener('mouseup', () => {
    removeBubble();
    setTimeout(async () => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (!text || text.length < 2 || text.length > 2000 || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionBubble = document.createElement('div');
      selectionBubble.id = '__lf_bubble';
      selectionBubble.innerHTML = '<span class="__lf_icon">文</span><span>Traducir</span>';
      selectionBubble.style.top = `${Math.max(10, rect.top - 46)}px`;
      selectionBubble.style.left = `${Math.max(10, rect.left + rect.width / 2 - 62)}px`;
      selectionBubble.addEventListener('click', async () => {
        const { srcLang = 'auto', tgtLang = 'es' } = await storageGet(['srcLang', 'tgtLang']);
        selectionBubble.innerHTML = '<span class="__lf_loader"></span><span>Procesando</span>';
        try {
          const translated = await translateText(text, srcLang, tgtLang);
          removeBubble();
          const tooltip = document.createElement('div');
          tooltip.id = '__lf_tooltip';
          tooltip.textContent = translated;
          tooltip.style.top = `${Math.min(window.innerHeight - 90, rect.bottom + 8)}px`;
          tooltip.style.left = `${Math.max(10, rect.left)}px`;
          document.body.appendChild(tooltip);
          const remove = () => tooltip.remove();
          setTimeout(remove, 5000);
          tooltip.addEventListener('click', remove);
        } catch (_) {
          selectionBubble.innerHTML = '<span>Error</span>';
          setTimeout(removeBubble, 1000);
        }
      });
      document.body.appendChild(selectionBubble);
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (selectionBubble && !selectionBubble.contains(e.target)) removeBubble();
  });
})();
