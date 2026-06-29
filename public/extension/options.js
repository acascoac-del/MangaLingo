/* MangaLingo — options page (v1.11.0) — con soporte MiMo */
const DEFAULT_API='http://localhost:3000';
const _pendingReqs=new Map();let _reqIdCounter=0;function _makeReqId(){return 'rq-'+(++_reqIdCounter)+'-'+Date.now();}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type==='options-result'){for(const [rid,p] of _pendingReqs){if(p.type==='options'){_pendingReqs.delete(rid);if(msg.ok)p.resolve(msg.data);else p.reject(new Error(msg.error));break;}}sendResponse({ok:true});return false;}
  if(msg?.type==='settings-result'){for(const [rid,p] of _pendingReqs){if(p.type==='settings'){_pendingReqs.delete(rid);if(msg.ok)p.resolve(msg.data);else p.reject(new Error(msg.error));break;}}sendResponse({ok:true});return false;}
  if(msg?.type==='settings-saved'){for(const [rid,p] of _pendingReqs){if(p.type==='save'){_pendingReqs.delete(rid);p.resolve();break;}}sendResponse({ok:true});return false;}
  return false;
});

function fetchOptionsAsync(){return new Promise((resolve,reject)=>{const rid=_makeReqId();_pendingReqs.set(rid,{type:'options',resolve,reject});chrome.runtime.sendMessage({type:'fetch-options'},()=>{if(chrome.runtime.lastError){_pendingReqs.delete(rid);reject(new Error(chrome.runtime.lastError.message));}});setTimeout(()=>{if(_pendingReqs.has(rid)){_pendingReqs.delete(rid);reject(new Error('timeout'));}},5000);});}
function getSettingsAsync(){return new Promise((resolve,reject)=>{const rid=_makeReqId();_pendingReqs.set(rid,{type:'settings',resolve,reject});chrome.runtime.sendMessage({type:'get-settings'},()=>{if(chrome.runtime.lastError){_pendingReqs.delete(rid);reject(new Error(chrome.runtime.lastError.message));}});setTimeout(()=>{if(_pendingReqs.has(rid)){_pendingReqs.delete(rid);reject(new Error('timeout'));}},3000);});}
function saveSettingsAsync(settings){return new Promise((resolve,reject)=>{const rid=_makeReqId();_pendingReqs.set(rid,{type:'save',resolve,reject});chrome.runtime.sendMessage({type:'save-settings',settings},()=>{if(chrome.runtime.lastError){_pendingReqs.delete(rid);reject(new Error(chrome.runtime.lastError.message));}});setTimeout(()=>{if(_pendingReqs.has(rid)){_pendingReqs.delete(rid);reject(new Error('save timeout'));}},5000);});}

function toggleMimoSection(){const t=document.getElementById('s-translator').value;const m=document.getElementById('mimo-section');const show=['xiaomi'].includes(t);if(show)m.classList.remove('hidden');else m.classList.add('hidden');}
const TRANSLATOR_LABELS={groq:'Groq',xiaomi:'Xiaomi MiMo',google:'Google Translate'};
function translatorLabel(d){return TRANSLATOR_LABELS[d.key]||d.name||d.key;}

(async()=>{
  try{
    const s=await getSettingsAsync();
    const opts=await fetchOptionsAsync().catch(()=>null);
    if(opts){
      fillSelect('s-target-lang',opts.languages.map(l=>[l.code,l.name]),s.targetLang);
      fillSelect('s-source-lang',opts.source_languages.map(l=>[l.code,l.name==='auto'?'Auto-detectar':l.name]),s.sourceLang);
      fillSelect('s-detector',opts.detectors.map(d=>[d.key,d.key+(d.heavy?' (heavy)':'')]),s.detector);
      fillSelect('s-ocr',opts.ocrs.map(d=>[d.key,d.key+(d.heavy?' (heavy)':'')]),s.ocr);
      fillSelect('s-translator',opts.translators.map(d=>[d.key,translatorLabel(d)+(d.needs_key?' (key)':'')+(d.heavy?' (heavy)':'')]),s.translator);
      fillSelect('s-inpainter',opts.inpainters.map(d=>[d.key,d.key+(d.heavy?' (heavy)':'')]),s.inpainter);
      fillSelect('s-renderer',opts.renderers.map(d=>[d.key,d.key]),s.renderer);
      document.getElementById('s-font').value=s.fontFamily||'anime_ace_3';
    }
    document.getElementById('s-api').value=s.apiBase||DEFAULT_API;
    document.getElementById('s-mimo-token').value=s.mimoToken||'';
    document.getElementById('s-font-size').value=s.fontSize||0;
    toggleMimoSection();
    document.getElementById('s-translator').addEventListener('change',toggleMimoSection);
  }catch(e){console.warn('[MangaLingo] options load failed:',e);}
})();

function fillSelect(id,options,current){const sel=document.getElementById(id);sel.innerHTML='';options.forEach(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;if(v===current)o.selected=true;sel.appendChild(o);});}

document.getElementById('save-settings').addEventListener('click',async()=>{
  const settings={targetLang:document.getElementById('s-target-lang').value,sourceLang:document.getElementById('s-source-lang').value,detector:document.getElementById('s-detector').value,ocr:document.getElementById('s-ocr').value,translator:document.getElementById('s-translator').value,inpainter:document.getElementById('s-inpainter').value,renderer:document.getElementById('s-renderer').value,fontFamily:document.getElementById('s-font').value,fontSize:parseInt(document.getElementById('s-font-size').value)||0,apiBase:document.getElementById('s-api').value.trim()||DEFAULT_API,mimoToken:document.getElementById('s-mimo-token').value.trim()};
  try{await saveSettingsAsync(settings);alert('✓ Ajustes guardados');}catch(e){alert('Error: '+e.message);}
});
