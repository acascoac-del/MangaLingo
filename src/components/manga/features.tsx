'use client';

import {
  ScanSearch,
  Type,
  Eraser,
  Languages,
  Paintbrush,
  Workflow,
  Globe,
  Chrome,
  Code2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const FEATURES = [
  {
    icon: ScanSearch,
    title: 'Detección de globos',
    body: 'Localiza automáticamente speech bubbles y cajas de texto. Backends MSER + clustering (ligero) o CRAFT / DBNet / CTD (pesado, GPU).',
  },
  {
    icon: Type,
    title: 'OCR multilenguaje',
    body: 'Tesseract con auto-detección de paquete de idioma, o manga_ocr / 48px_ctc para japoneses especializados en manga.',
  },
  {
    icon: Eraser,
    title: 'Inpainting (limpieza)',
    body: 'Borra el texto original sin tocar el arte. Telea / Navier-Stokes para CPU, LaMa / AOT / SD para resultados de producción.',
  },
  {
    icon: Languages,
    title: 'Traducción multilenguaje',
    body: 'Google, DeepL, ChatGPT, Gemini, DeepSeek, Qwen, Groq, Papago, Yandex o Bing. Cambio en caliente desde la extensión.',
  },
  {
    icon: Paintbrush,
    title: 'Renderizado sobre la imagen',
    body: 'Pillow con auto-fit y wrapping por glyph para CJK. Fuentes comic, anime_ace, msyh, msgothic. Outlined para legibilidad.',
  },
  {
    icon: Workflow,
    title: 'Un solo request',
    body: 'Todo el pipeline en una llamada POST. Recibes imagen traducida + metadata (regiones, textos, tiempos por etapa).',
  },
  {
    icon: Chrome,
    title: 'Extensión Chrome V3',
    body: 'Click derecho sobre cualquier imagen → traducir. Popup con preview. Atajo Ctrl+Shift+M. Sin dependencias externas.',
  },
  {
    icon: Globe,
    title: 'Demo pública',
    body: 'Sube una imagen desde el navegador y obtén la traducción al instante. Sin registro, sin API key.',
  },
  {
    icon: Code2,
    title: 'Código abierto',
    body: 'Backend Python + frontend Next.js + extensión Chrome. Toda la cadena de modules de MangaLingo engine incluida.',
  },
];

export function Features() {
  return (
    <section id="features" className="container mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Todo lo que necesita un traductor de manga
        </h2>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Nueve capacidades que tradicionalmente requieren encadenar tres o
          cuatro servicios — aquí integradas en una sola API.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <Card key={f.title} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-5">
              <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                <f.icon className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
