'use client';

import { ScanSearch, Type, Eraser, Languages, Paintbrush, ArrowRight } from 'lucide-react';

const STAGES = [
  {
    icon: ScanSearch,
    step: '01',
    title: 'Detección',
    body: 'MSER + clustering identifica speech bubbles. Devuelve bbox + polígono + confianza por región.',
    color: 'from-rose-500/20 to-rose-500/0',
  },
  {
    icon: Type,
    step: '02',
    title: 'OCR',
    body: 'Tesseract o manga_ocr reconoce el texto japonés / inglés / coreano dentro de cada bbox.',
    color: 'from-amber-500/20 to-amber-500/0',
  },
  {
    icon: Languages,
    step: '03',
    title: 'Traducción',
    body: 'El traductor elegido (Google, DeepL, ChatGPT, Gemini…) traduce el texto al idioma destino.',
    color: 'from-emerald-500/20 to-emerald-500/0',
  },
  {
    icon: Eraser,
    step: '04',
    title: 'Inpainting',
    body: 'Se construye una máscara a partir de los bbox y se borra el texto original con cv2.inpaint / LaMa.',
    color: 'from-sky-500/20 to-sky-500/0',
  },
  {
    icon: Paintbrush,
    step: '05',
    title: 'Render',
    body: 'Pillow pinta el texto traducido dentro del bbox, con auto-fit y wrapping por glyph para CJK.',
    color: 'from-fuchsia-500/20 to-fuchsia-500/0',
  },
];

export function Pipeline() {
  return (
    <section id="pipeline" className="container mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Cinco etapas, una sola llamada
        </h2>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          El endpoint <code className="px-1 py-0.5 rounded bg-muted">POST /api/translate</code>{' '}
          orquesta las cinco etapas en serie y devuelve la imagen final + metadata.
        </p>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        {STAGES.map((s, i) => (
          <div key={s.step} className="relative">
            <div className={`rounded-xl border bg-gradient-to-b ${s.color} p-5 h-full`}>
              <div className="flex items-center justify-between mb-3">
                <div className="size-9 rounded-md bg-background/70 flex items-center justify-center">
                  <s.icon className="size-5" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-muted-foreground/60">
                  {s.step}
                </span>
              </div>
              <h3 className="font-semibold mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
            {i < STAGES.length - 1 && (
              <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 size-6 items-center justify-center rounded-full border bg-background z-10">
                <ArrowRight className="size-3" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border bg-muted/30 p-5 text-sm font-mono overflow-x-auto">
        <div className="text-muted-foreground mb-2"># Pipeline orquestado por pipeline.py</div>
        <pre className="text-xs leading-relaxed">{`result = MangaTranslatorPipeline(
    detector_key="opencv",
    ocr_key="tesseract",
    translator_key="groq",
    inpainter_key="opencv",
    renderer_key="pillow",
    target_lang="es",
    source_lang="auto",
).run(image_b64)

# result.translated_b64 -> PNG base64
# result.regions        -> [{bbox, source_text, translated_text, confidence}, ...]
# result.stages         -> {detection_ms, ocr_ms, translation_ms, inpainting_ms, rendering_ms}`}</pre>
      </div>
    </section>
  );
}
