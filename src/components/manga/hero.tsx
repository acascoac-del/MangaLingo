'use client';

import { ArrowRight, Github, Puzzle, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            'radial-gradient(60% 60% at 30% 0%, rgba(244,114,182,0.18) 0%, rgba(168,85,247,0.10) 35%, transparent 70%), radial-gradient(50% 50% at 90% 20%, rgba(34,197,94,0.12) 0%, transparent 60%)',
        }}
      />
      <div className="container mx-auto px-4 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="size-3 mr-1" /> Pipeline de MangaLingo engine
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Traduce mangas en un{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-500">
              solo request
            </span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
            Detección de globos, OCR, inpainting, traducción multilenguaje y
            renderizado final — todo en una única llamada a tu propia API.
            Demo web, portal de descargas y extensión Chrome totalmente integrada.
          </p>

          <div className="flex flex-wrap gap-3 mt-8">
            <Button asChild size="lg">
              <a href="#demo">
                <Zap className="size-4 mr-2" /> Probar la demo
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#download">
                <Puzzle className="size-4 mr-2" /> Instalar extensión
                <ArrowRight className="size-4 ml-2" />
              </a>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-12">
            {[
              { k: '5', label: 'etapas en 1 request' },
              { k: '10+', label: 'traductores soportados' },
              { k: '22', label: 'idiomas destino' },
              { k: 'V3', label: 'Manifest Chrome' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-card/50 backdrop-blur p-4">
                <div className="text-2xl font-bold tabular-nums">{s.k}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
