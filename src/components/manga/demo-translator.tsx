"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  Languages,
  Sparkles,
  Eye,
  ArrowRight,
  AlertCircle,
  Download,
  RotateCcw,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

type Options = {
  detectors: { key: string; heavy: boolean }[];
  ocrs: { key: string; heavy: boolean }[];
  translators: {
    key: string;
    name?: string;
    heavy?: boolean;
    needs_key?: boolean;
    key_env?: string;
  }[];
  inpainters: { key: string; heavy: boolean }[];
  renderers: { key: string; heavy: boolean }[];
  languages: { code: string; name: string }[];
  source_languages: { code: string; name: string }[];
  fonts: { key: string }[];
  defaults?: { translator?: string; target_lang?: string };
};

type Region = {
  index: number;
  bbox: [number, number, number, number];
  polygon: number[][];
  source_text: string;
  translated_text: string;
  confidence: number;
  inpainted: boolean;
  rendered: boolean;
};

type TranslateResponse = {
  success: boolean;
  translated_image?: string;
  original_image?: string;
  processing_time_ms?: number;
  stages?: Record<string, number>;
  regions?: Region[];
  region_count?: number;
  backend_used?: {
    detector: string;
    ocr: string;
    translator: string;
    requested_translator?: string;
    inpainter: string;
    renderer: string;
    target_lang: string;
    source_lang: string;
    device: string;
  };
  error?: string;
  hint?: string;
};

type BatchItemResult = {
  index: number;
  success: boolean;
  processing_time_ms?: number;
  cache_hit?: boolean;
  translated_image?: string;
  region_count?: number;
  error?: string;
};

type BatchResponse = {
  success: boolean;
  total?: number;
  succeeded?: number;
  failed?: number;
  processing_time_ms?: number;
  results?: BatchItemResult[];
  backend_used?: { translator: string; device: string; concurrency?: number };
  error?: string;
};

const STAGE_LABELS: Record<string, string> = {
  detection_ms: "Deteccion de globos",
  ocr_ms: "OCR (reconocimiento)",
  translation_ms: "Traduccion",
  inpainting_ms: "Inpainting (limpieza)",
  rendering_ms: "Renderizado final",
};

// Fallback mientras /api/options no responde o no expone la lista.
const TRANSLATOR_FALLBACK: {
  key: string;
  name: string;
  heavy?: boolean;
  needs_key?: boolean;
}[] = [
  { key: "groq", name: "Groq (cloud, rapido)", needs_key: true },
  { key: "xiaomi", name: "Xiaomi MiMo v2.5", needs_key: true },
  { key: "xiaomi_pro", name: "Xiaomi MiMo v2.5-pro", needs_key: true },
  { key: "ollama", name: "Ollama (OpenAI-compatible)" },
];

async function toBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function DemoTranslator() {
  const [options, setOptions] = useState<Options | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [batchResults, setBatchResults] = useState<BatchItemResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"ok" | "warming" | "down">("ok");

  // Defaults: solo Groq, Xiaomi MiMo u Ollama. Los aliases viejos migran a Groq.
  const [targetLang, setTargetLang] = useState("es");
  const [sourceLang, setSourceLang] = useState("auto");
  const [detector, setDetector] = useState("ctd");
  const [ocr, setOcr] = useState("manga_ocr");
  const [translator, setTranslator] = useState("groq");
  const [inpainter, setInpainter] = useState("lama");
  const [renderer, setRenderer] = useState("manga2eng");
  const [fontFamily, setFontFamily] = useState("comic");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const translatorOptions = useMemo(() => {
    if (options?.translators && options.translators.length > 0) return options.translators;
    return TRANSLATOR_FALLBACK;
  }, [options]);

  const isHeavyTranslator = useMemo(() => {
    const meta = translatorOptions.find((t) => t.key === translator);
    return Boolean(meta?.heavy);
  }, [translatorOptions, translator]);

  // Fetch available backends
  useEffect(() => {
    let mounted = true;
    fetch("/api/options")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        setOptions(data);
        // Si el backend anuncia un traductor por defecto, lo adoptamos solo si
        // el usuario aun no eligio uno distinto del inicial.
        if (data?.defaults?.translator) {
          setTranslator((cur) => (cur === "groq" ? data.defaults.translator : cur));
        }
      })
      .catch((e) => mounted && setError(`No se pudieron cargar las opciones: ${e.message}`));
    return () => {
      mounted = false;
    };
  }, []);

  // Periodically check backend health
  useEffect(() => {
    let mounted = true;
    const check = () => {
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (!mounted) return;
          if (data.status === "ok") {
            setBackendStatus("ok");
          } else if (data.backend === "down") {
            setBackendStatus("down");
          } else {
            setBackendStatus("warming");
          }
        })
        .catch(() => mounted && setBackendStatus("down"));
    };
    check();
    const id = setInterval(check, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Animate the progress bar while waiting on the API
  useEffect(() => {
    if (!loading) {
      setProgress(0);
      return;
    }
    setProgress(8);
    const id = setInterval(() => {
      setProgress((p) => (p < 92 ? p + Math.random() * 6 : p));
    }, 350);
    return () => clearInterval(id);
  }, [loading]);

  const addFiles = useCallback((newFiles: File[]) => {
    if (!newFiles || newFiles.length === 0) return;
    const valid: File[] = [];
    for (const f of newFiles) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 12 * 1024 * 1024) continue;
      valid.push(f);
    }
    if (valid.length === 0) {
      toast.error("Las imagenes deben ser JPG/PNG/WebP y pesar menos de 12 MB cada una");
      return;
    }
    if (valid.length !== newFiles.length) {
      toast.warning(`Solo ${valid.length} de ${newFiles.length} imagenes son validas`);
    }
    setFiles((prev) => {
      const merged = [...prev, ...valid].slice(0, 50);
      setPreviews((prevU) => {
        prevU.forEach((u) => URL.revokeObjectURL(u));
        return merged.map((f) => URL.createObjectURL(f));
      });
      setActiveIdx(0);
      setResult(null);
      setBatch(null);
      setError(null);
      return merged;
    });
  }, []);

  const onPickFile = useCallback(
    (f: File | null) => {
      if (!f) return;
      addFiles([f]);
    },
    [addFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const list = Array.from(e.dataTransfer.files ?? []);
      if (list.length > 0) addFiles(list);
    },
    [addFiles],
  );

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setPreviews((prevU) => {
        const removed = prevU[idx];
        if (removed) URL.revokeObjectURL(removed);
        return prevU.filter((_, i) => i !== idx);
      });
      setActiveIdx((cur) => Math.min(Math.max(cur, 0), Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const translateOne = useCallback(async () => {
    if (files.length === 0) {
      toast.error("Sube una imagen primero");
      return;
    }
    const file = files[activeIdx] ?? files[0];
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("target_lang", targetLang);
      form.append("source_lang", sourceLang);
      form.append("detector", detector);
      form.append("ocr", ocr);
      form.append("translator", translator);
      form.append("inpainter", inpainter);
      form.append("renderer", renderer);
      form.append("font_family", fontFamily);
      form.append("font_size", "0");
      form.append("return_metadata", "true");

      const r = await fetch("/api/translate", { method: "POST", body: form });
      const data: TranslateResponse = await r.json();
      if (!data.success) {
        throw new Error(
          data.hint ? `${data.error} | ${data.hint}` : data.error || "Error desconocido en el pipeline",
        );
      }
      setResult(data);
      setProgress(100);
      toast.success(`Traducido en ${data.processing_time_ms} ms`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Fallo la traduccion");
    } finally {
      setLoading(false);
    }
  }, [activeIdx, detector, files, fontFamily, inpainter, ocr, renderer, sourceLang, targetLang, translator]);

  const translateBatch = useCallback(async () => {
    if (files.length < 2) {
      toast.error("Subi al menos 2 paginas para usar batch");
      return;
    }
    if (files.length > 50) {
      toast.error("Maximo 50 paginas por batch");
      return;
    }
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: files.length });
    setBatchResults([]);
    setError(null);
    setResult(null);
    try {
      const b64List = await Promise.all(files.map(toBase64));
      const r = await fetch("/api/translate/batch/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          images: b64List,
          target_lang: targetLang,
          source_lang: sourceLang,
          detector,
          ocr,
          translator,
          inpainter,
          renderer,
          font_family: fontFamily,
        }),
      });

      if (!r.ok) {
        const errText = await r.text();
        throw new Error(errText || `HTTP ${r.status}`);
      }

      const collected: BatchItemResult[] = [];
      let batchComplete: BatchResponse | null = null;
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No se pudo leer el stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") {
            const item = {
              index: event.index,
              success: event.success,
              processing_time_ms: event.processing_time_ms,
              cache_hit: event.cache_hit,
              translated_image: event.translated_image,
              region_count: event.region_count,
              error: event.error,
            };
            collected.push(item);
            setBatchResults((prev) => [...prev.filter((r) => r.index !== item.index), item]);
            setBatchProgress({ done: event.done, total: event.total });
          } else if (event.type === "complete") {
            batchComplete = event;
          }
        }
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer);
        if (event.type === "complete") batchComplete = event;
      }

      const finalBatch: BatchResponse = batchComplete
        ? { ...batchComplete, results: collected }
        : { success: collected.some((c) => c.success), total: files.length, results: collected };

      setBatch(finalBatch);
      const ok = finalBatch.succeeded ?? collected.filter((c) => c.success).length;
      toast.success(
        `Batch listo: ${ok}/${files.length} paginas en ${finalBatch.processing_time_ms ?? "?"} ms`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Fallo el batch");
    } finally {
      setBatchLoading(false);
    }
  }, [detector, files, fontFamily, inpainter, ocr, renderer, sourceLang, targetLang, translator]);

  const reset = useCallback(() => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    setActiveIdx(0);
    setResult(null);
    setBatch(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [previews]);

  const activePreview = previews[activeIdx] ?? null;
  const activeBatchResult = batchResults.find((r) => r.index === activeIdx) ?? batch?.results?.find((r) => r.index === activeIdx);

  return (
    <section id="demo" className="container mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <Badge variant="secondary" className="mb-3">
          <Sparkles className="size-3 mr-1" /> Demo en vivo
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Prueba el traductor en un solo request
        </h2>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Sube una o varias paginas de manga y obtene las imagenes traducidas. El pipeline
          ejecuta deteccion, OCR, inpainting, traduccion y render en una unica llamada.
        </p>

        {backendStatus === "down" && (
          <Alert className="mt-4 max-w-2xl mx-auto border-amber-500/50 bg-amber-500/10">
            <AlertCircle className="size-4 text-amber-600" />
            <AlertTitle className="text-amber-700">Backend reiniciandose...</AlertTitle>
            <AlertDescription className="text-amber-700/90">
              El servicio de traduccion (MangaLingo engine, ~600 MB en RAM) se esta
              reiniciando. Un watchdog automatico lo revive en ~15s. Espera unos
              segundos y vuelve a intentarlo; la pagina se actualiza sola.
            </AlertDescription>
          </Alert>
        )}
        {backendStatus === "ok" && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Backend listo - {options?.translators.length ?? TRANSLATOR_FALLBACK.length} traductores disponibles
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            {files.length === 0 && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:bg-muted/40 transition-colors min-h-[320px] flex flex-col items-center justify-center"
              >
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="size-7 text-primary" />
                </div>
                <p className="font-medium">Arrastra una o varias paginas aqui</p>
                <p className="text-sm text-muted-foreground mt-1">
                  PNG, JPG o WebP - hasta 12 MB por imagen (max 50 en batch)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length > 0) addFiles(list);
                  }}
                />
              </div>
            )}

            {files.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {previews.map((p, i) => (
                    <div
                      key={p + i}
                      className={
                        "relative size-14 rounded-md overflow-hidden border-2 cursor-pointer " +
                        (i === activeIdx
                          ? "border-primary"
                          : "border-transparent opacity-70 hover:opacity-100")
                      }
                      onClick={() => setActiveIdx(i)}
                      title={"Pagina " + (i + 1)}
                    >
                      <img src={p} alt={"pagina " + (i + 1)} className="object-cover w-full h-full" />
                      <button
                        type="button"
                        aria-label={"Quitar pagina " + (i + 1)}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="absolute top-0 right-0 size-5 bg-background/80 hover:bg-background rounded-bl-md flex items-center justify-center"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-14"
                  >
                    <Upload className="size-3.5 mr-1" /> Anadir
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      if (list.length > 0) addFiles(list);
                    }}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <figure>
                    <figcaption className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <Eye className="size-3" /> Original
                    </figcaption>
                    <div className="relative rounded-lg overflow-hidden border bg-muted/30 aspect-[3/4]">
                      {activePreview ? (
                        <img
                          src={activePreview}
                          alt="Original"
                          className="object-contain w-full h-full"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                    </div>
                  </figure>

                  <figure>
                    <figcaption className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <Languages className="size-3" /> Traducida
                    </figcaption>
                    <div className="relative rounded-lg overflow-hidden border bg-muted/30 aspect-[3/4]">
                      {(loading || (batchLoading && !activeBatchResult?.translated_image)) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-background/70 backdrop-blur-sm">
                          <Loader2 className="size-6 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {batchLoading
                              ? "Batch " + batchProgress.done + "/" + batchProgress.total
                              : "Traduciendo..."}
                          </span>
                        </div>
                      )}
                      {activeBatchResult?.translated_image ? (
                        <img
                          src={"data:image/png;base64," + activeBatchResult.translated_image}
                          alt="Traducida (batch)"
                          className="object-contain w-full h-full"
                        />
                      ) : result?.translated_image ? (
                        <img
                          src={"data:image/png;base64," + result.translated_image}
                          alt="Traducida"
                          className="object-contain w-full h-full"
                        />
                      ) : (
                        !loading &&
                        !batchLoading && (
                          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                            Listo para traducir
                          </div>
                        )
                      )}
                    </div>
                  </figure>
                </div>

                <div className="flex flex-wrap gap-2 mt-5">
                  <Button
                    onClick={translateOne}
                    disabled={loading || batchLoading || backendStatus === "down"}
                    title={backendStatus === "down" ? "Backend reiniciandose, espera unos segundos..." : undefined}
                  >
                    {loading ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="size-4 mr-2" />
                    )}
                    {backendStatus === "down" ? "Esperando backend..." : "Traducir imagen"}
                  </Button>
                  <Button
                    onClick={translateBatch}
                    disabled={loading || batchLoading || backendStatus === "down" || files.length < 2}
                    variant="secondary"
                    title={
                      files.length < 2
                        ? "Subi 2 o mas paginas para usar batch"
                        : "Traduce todas las paginas en paralelo via /api/translate/batch"
                    }
                  >
                    {batchLoading ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Layers className="size-4 mr-2" />
                    )}
                    Batch ({files.length})
                  </Button>
                  <Button variant="outline" onClick={reset} disabled={loading || batchLoading}>
                    <RotateCcw className="size-4 mr-2" /> Limpiar
                  </Button>
                  {(result?.translated_image || activeBatchResult?.translated_image) && (
                    <Button asChild variant="secondary">
                      <a
                        href={
                          "data:image/png;base64," +
                          (activeBatchResult?.translated_image ?? result?.translated_image)
                        }
                        download={"translated-" + Date.now() + ".png"}
                      >
                        <Download className="size-4 mr-2" /> Descargar PNG
                      </a>
                    </Button>
                  )}
                </div>

                {loading && (
                  <div className="mt-4">
                    <Progress value={progress} className="h-1.5" />
                    <p className="text-xs text-muted-foreground mt-2">
                      Pipeline ML real: deteccion CTD -&gt; OCR manga_ocr -&gt; traduccion cloud -&gt;
                      inpainting LaMa -&gt; render manga2eng. ~2-4s por imagen con Groq/Xiaomi.
                    </p>
                  </div>
                )}

                {batchLoading && (
                  <div className="mt-4">
                    <Progress
                      value={batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Batch en paralelo ({batchProgress.done}/{batchProgress.total}) — streaming en tiempo real.
                    </p>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {result?.stages && Object.keys(result.stages).length > 0 && (
                  <div className="mt-5">
                    <h4 className="text-sm font-medium mb-2">Tiempos por etapa</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {Object.entries(result.stages).map(([k, v]) => (
                        <div key={k} className="rounded-md border bg-muted/40 px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground truncate">
                            {STAGE_LABELS[k] ?? k}
                          </div>
                          <div className="text-sm font-semibold tabular-nums">{v} ms</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Total: <span className="font-medium tabular-nums">{result.processing_time_ms} ms</span>
                      {" - "}
                      {result.region_count} regiones detectadas
                    </div>
                  </div>
                )}

                {result?.backend_used && (
                  <div className="mt-3">
                    <h4 className="text-sm font-medium mb-2">Backend usado</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["detector", result.backend_used.detector],
                        ["ocr", result.backend_used.ocr],
                        ["translator", result.backend_used.translator],
                        ["inpainter", result.backend_used.inpainter],
                        ["renderer", result.backend_used.renderer],
                        ["target", result.backend_used.target_lang],
                        ["device", result.backend_used.device],
                      ].map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px] py-0 font-mono">
                          {k}={String(v)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(batchResults.length > 0 || (batch && batch.results)) && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Batch</h4>
                    <div className="text-xs text-muted-foreground mb-2">
                      {batchProgress.done}/{batchProgress.total} paginas
                      {batch?.processing_time_ms ? ` en ${batch.processing_time_ms} ms` : " (streaming)"}
                      {batch?.backend_used?.translator
                        ? " (translator=" + batch.backend_used.translator + ")"
                        : ""}
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                      {Array.from({ length: files.length }).map((_, i) => {
                        const r = batchResults.find((br) => br.index === i) ?? batch?.results?.find((br) => br.index === i);
                        return (
                        <div
                          key={i}
                          className={
                            "relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer " +
                            (r
                              ? r.success
                                ? i === activeIdx
                                  ? "border-primary"
                                  : "border-emerald-500/40 opacity-80 hover:opacity-100"
                                : "border-destructive/50 opacity-60"
                              : "border-muted/30 opacity-40 hover:opacity-60")
                          }
                          onClick={() => setActiveIdx(i)}
                          title={
                            r
                              ? r.success
                                ? "Pagina " + (i + 1) + ": " + (r.processing_time_ms ?? "?") + " ms (" + (r.region_count ?? 0) + " regiones)"
                                : "Pagina " + (i + 1) + ": " + (r.error ?? "fallo")
                              : "Pagina " + (i + 1) + " — procesando..."
                          }
                        >
                          {r?.translated_image ? (
                            <img
                              src={"data:image/png;base64," + r.translated_image}
                              alt={"result " + i}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                              {r ? "err" : i + 1}
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Languages className="size-4" /> Idiomas
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Origen</Label>
                  <Select value={sourceLang} onValueChange={setSourceLang}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(options?.source_languages ?? [{ code: "auto", name: "auto" }]).map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.code === "auto" ? "Auto-detectar" : l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Destino</Label>
                  <Select value={targetLang} onValueChange={setTargetLang}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(options?.languages ?? [{ code: "es", name: "spanish" }]).map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Pipeline</h3>
              <div className="space-y-3">
                <Setting
                  label="Detector"
                  value={detector}
                  onChange={setDetector}
                  items={options?.detectors ?? [{ key: "opencv", heavy: false }]}
                />
                <Setting
                  label="OCR"
                  value={ocr}
                  onChange={setOcr}
                  items={options?.ocrs ?? [{ key: "tesseract", heavy: false }]}
                />
                <Setting
                  label="Traductor"
                  value={translator}
                  onChange={setTranslator}
                  items={translatorOptions.map((t) => ({
                    key: t.key,
                    name: t.name,
                    heavy: t.heavy,
                    needs_key: t.needs_key,
                    key_env: t.key_env,
                  }))}
                  renderLabel={(it) => (
                    <span className="inline-flex items-center gap-1.5">
                      {it.name ?? it.key}
                      {it.needs_key ? (
                        <Badge variant="outline" className="ml-1 text-[9px] py-0">
                          key
                        </Badge>
                      ) : null}
                      {it.heavy ? (
                        <Badge variant="outline" className="ml-1 text-[9px] py-0">
                          heavy
                        </Badge>
                      ) : null}
                    </span>
                  )}
                />
                {isHeavyTranslator && (
                  <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="size-4 text-amber-600" />
                    <AlertTitle className="text-amber-700 text-xs">Proveedor lento</AlertTitle>
                    <AlertDescription className="text-amber-700/90 text-xs">
                      Este proveedor puede tardar mas segun el servidor configurado.
                    </AlertDescription>
                  </Alert>
                )}
                <Setting
                  label="Inpainter"
                  value={inpainter}
                  onChange={setInpainter}
                  items={options?.inpainters ?? [{ key: "opencv", heavy: false }]}
                />
                <Setting
                  label="Renderer"
                  value={renderer}
                  onChange={setRenderer}
                  items={options?.renderers ?? [{ key: "pillow", heavy: false }]}
                />
                <div>
                  <Label className="text-xs text-muted-foreground">Fuente</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(options?.fonts ?? [{ key: "comic" }]).map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 text-xs text-muted-foreground">
              <p>
                Los traductores <Badge variant="outline" className="ml-1 text-[10px]">key</Badge>{" "}
                requieren API key (Groq, Xiaomi). Ollama usa el servidor configurado en
                CUSTOM_OPENAI_API_BASE/CUSTOM_OPENAI_MODEL.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

type SettingItem = {
  key: string;
  name?: string;
  heavy?: boolean;
  needs_key?: boolean;
  key_env?: string;
};

function Setting<T extends SettingItem>({
  label,
  value,
  onChange,
  items,
  renderLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: T[];
  renderLabel?: (it: T) => React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.key} value={it.key}>
              {renderLabel ? (
                renderLabel(it)
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {it.key}
                  {it.heavy ? (
                    <Badge variant="outline" className="ml-1 text-[10px] py-0">
                      heavy
                    </Badge>
                  ) : null}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
