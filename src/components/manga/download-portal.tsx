'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  Chrome,
  Puzzle,
  Shield,
  Code2,
  Copy,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

type Asset = {
  name: string;
  size: number;
  url: string;
  mtime: string;
};

const INSTALL_STEPS = [
  {
    title: '1 · Descarga el ZIP',
    body: 'Descarga el archivo mangalingo-extension.zip desde el botón de arriba y guárdalo en una carpeta permanente (no vayas a borrar).',
  },
  {
    title: '2 · Descomprime el ZIP',
    body: 'Extrae el contenido en una carpeta. Debes ver manifest.json, popup.html, content.js, background.js y la carpeta icons/.',
  },
  {
    title: '3 · Abre chrome://extensions',
    body: 'Pega chrome://extensions en la barra de direcciones de Chrome y pulsa Enter. También funciona en Brave, Edge y otros navegadores basados en Chromium.',
  },
  {
    title: '4 · Activa el Modo desarrollador',
    body: 'Arriba a la derecha encontrarás un interruptor "Modo desarrollador". Actívalo.',
  },
  {
    title: '5 · Cargar sin compresión',
    body: 'Pulsa el botón "Cargar descomprimida" y selecciona la carpeta que acabas de extraer. La extensión aparecerá en la lista.',
  },
  {
    title: '6 · Fija la extensión',
    body: 'Pulsa el icono de pieza de puzzle en la barra de herramientas y fija "MangaLingo" para tener acceso rápido.',
  },
];

export function DownloadPortal() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/extension/assets')
      .then((r) => r.json())
      .then((data) => {
        if (data.assets) setAssets(data.assets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success('Copiado');
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section id="download" className="container mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <Badge variant="secondary" className="mb-3">
          <Puzzle className="size-3 mr-1" /> Portal de descargas
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Instala la extensión Chrome
        </h2>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Manifest V3. Funciona en cualquier página donde veas imágenes de
          manga. Click derecho sobre una imagen → <em>Traducir manga</em>.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        {/* ----- Downloads ----- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-5" /> Assets disponibles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Cargando…
              </div>
            )}
            {!loading && assets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No se encontraron assets. Empaqueta la extensión primero.
              </p>
            )}
            {assets.map((a) => (
              <div
                key={a.name}
                className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {a.name.endsWith('.zip') ? (
                      <Puzzle className="size-4 text-primary" />
                    ) : (
                      <Code2 className="size-4 text-primary" />
                    )}
                    {a.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(a.size / 1024).toFixed(1)} KB · {new Date(a.mtime).toLocaleDateString()}
                  </div>
                </div>
                <Button asChild size="sm">
                  <a href={a.url} download>
                    <Download className="size-3.5 mr-1" /> Bajar
                  </a>
                </Button>
              </div>
            ))}

            <div className="mt-4 border-t pt-4 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1">
                <Shield className="size-3" /> Sin permisos de pago ni captura de datos.
              </p>
              <p className="flex items-center gap-1">
                <Chrome className="size-3" /> Compatible con Chrome 110+, Brave, Edge y Opera.
              </p>
              <p className="flex items-center gap-1">
                <Code2 className="size-3" /> Código abierto en <code>extension/</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ----- Install steps ----- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="size-5" /> Cómo instalar (6 pasos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="steps">
              <TabsList className="mb-4">
                <TabsTrigger value="steps">Pasos</TabsTrigger>
                <TabsTrigger value="usage">Uso</TabsTrigger>
                <TabsTrigger value="api">API</TabsTrigger>
              </TabsList>

              <TabsContent value="steps" className="space-y-3">
                {INSTALL_STEPS.map((s) => (
                  <div key={s.title} className="flex gap-3">
                    <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-sm">{s.title}</div>
                      <p className="text-sm text-muted-foreground">{s.body}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 rounded-md bg-muted/40 text-xs font-mono break-all">
                  chrome://extensions
                  <button
                    onClick={() => copy('chrome://extensions', 'ext-url')}
                    className="ml-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                    aria-label="Copiar"
                  >
                    {copied === 'ext-url' ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </TabsContent>

              <TabsContent value="usage" className="space-y-3 text-sm">
                <p>
                  Una vez instalada, hay tres formas de usar la extensión:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Click derecho sobre una imagen</strong>{' '}
                    → <em>Traducir manga</em>. La imagen traducida aparece
                    flotando sobre la original.
                  </li>
                  <li>
                    <strong className="text-foreground">Popup de la extensión</strong>:
                    pulsa el icono de la extensión para abrir el panel. Pega una
                    URL o sube una imagen desde tu equipo.
                  </li>
                  <li>
                    <strong className="text-foreground">Atajo de teclado</strong>:
                    pulsa <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">Ctrl+Shift+M</kbd>{' '}
                    (Cmd+Shift+M en macOS) estando sobre una imagen para traducirla al instante.
                  </li>
                </ol>
                <p className="mt-2">
                  En el panel de opciones puedes cambiar el idioma destino, el
                  backend OCR, el traductor y la fuente tipográfica. Todo se
                  guarda en <code>chrome.storage.sync</code> y se sincroniza
                  entre tus dispositivos.
                </p>
              </TabsContent>

              <TabsContent value="api" className="space-y-3 text-sm">
                <p>
                  La extensión usa el mismo endpoint que la demo web. Puedes
                  usar la API directamente desde cualquier cliente:
                </p>
                <div className="relative">
                  <pre className="text-[11px] leading-tight bg-muted/60 p-3 rounded-md overflow-x-auto font-mono">
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://your-host'}/api/translate \\
  -F "image=@panel.png" \\
  -F "target_lang=es" \\
  -F "source_lang=auto" \\
  -F "detector=opencv" \\
  -F "ocr=tesseract" \\
  -F "translator=google" \\
  -F "inpainter=opencv" \\
  -F "renderer=pillow" \\
  -F "font_family=comic"`}
                  </pre>
                  <button
                    onClick={() => copy(
                      `curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://your-host'}/api/translate -F "image=@panel.png" -F "target_lang=es"`,
                      'curl',
                    )}
                    className="absolute top-2 right-2 p-1 rounded bg-background/80 hover:bg-background"
                    aria-label="Copiar"
                  >
                    {copied === 'curl' ? (
                      <CheckCircle2 className="size-3 text-green-600" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ¿Quieres usar el JSON endpoint? POST a{' '}
                  <code>/api/translate</code> con header{' '}
                  <code>Content-Type: application/json</code> y body{' '}
                  <code>{'{ "image": "<base64>", "target_lang": "es" }'}</code>.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="/api/translate" target="_blank" rel="noreferrer">
                    Ver esquema del endpoint <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
