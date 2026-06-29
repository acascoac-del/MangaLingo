'use client';

import Link from 'next/link';
import { Github, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t mt-auto bg-muted/30">
      <div className="container mx-auto px-4 py-10">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="font-semibold text-lg mb-2">MangaLingo</div>
            <p className="text-sm text-muted-foreground">
              Pipeline de traducción de manga end-to-end. API propia, demo web
              y extensión Chrome — todo en un único repositorio.
            </p>
          </div>

          <div>
            <div className="font-medium mb-3">Recursos</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="#demo" className="text-muted-foreground hover:text-foreground">Demo en vivo</Link></li>
              <li><Link href="#download" className="text-muted-foreground hover:text-foreground">Descargar extensión</Link></li>
              <li><Link href="#features" className="text-muted-foreground hover:text-foreground">Características</Link></li>
              <li><Link href="#pipeline" className="text-muted-foreground hover:text-foreground">Cómo funciona</Link></li>
              <li><a href="/api/translate" className="text-muted-foreground hover:text-foreground">Esquema de la API</a></li>
              <li><a href="/api/options" className="text-muted-foreground hover:text-foreground">Backends disponibles</a></li>
            </ul>
          </div>

          <div>
            <div className="font-medium mb-3">Backends soportados</div>
            <ul className="space-y-1 text-xs text-muted-foreground font-mono">
              <li>detectores: opencv · default · dbnet · ctd · craft</li>
              <li>ocr: tesseract · manga_ocr · 48px_ctc · 48px · 32px</li>
              <li>inpainters: opencv · lama · sd · aot · attn</li>
              <li>translators: google · deepl · chatgpt · gemini · deepseek · qwen · groq · papago · yandex · bing</li>
              <li>renderers: pillow · gimp · text_eng</li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            Construido con <Heart className="size-3 fill-rose-500 text-rose-500" /> sobre
            <code className="px-1 py-0.5 rounded bg-muted">MangaLingo engine</code>
          </div>
          <div className="flex items-center gap-2">
            <Github className="size-3.5" />
            <span>Manifest V3 · Next.js 16 · FastAPI · Pillow · OpenCV · Tesseract</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
