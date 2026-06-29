import { NextRequest, NextResponse } from "next/server";

// Esta ruta debe correr en el runtime de Node (no Edge) para poder hacer fetch al backend Python local.
export const runtime = "nodejs";
// Forzamos dynamic: nunca cachear el handler en build estatico.
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes limit

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "256mb",
    },
  },
};

import { getBackendUrl } from "@/lib/backend-url";

/** Timeout batch: 50 imagenes (limite duro del backend) con margen. */
const BATCH_TIMEOUT_MS = 600_000;

export async function POST(req: NextRequest) {
  let payload: { images?: unknown[]; [key: string]: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_json: el body debe ser JSON con { images: [base64, base64, ...] }" },
      { status: 400 },
    );
  }

  const images = Array.isArray(payload?.images) ? payload.images : null;
  if (!images || images.length === 0) {
    return NextResponse.json(
      { success: false, error: "missing_images: envia { images: [base64, base64, ...] } con al menos 1 imagen" },
      { status: 400 },
    );
  }
  if (images.length > 50) {
    return NextResponse.json(
      { success: false, error: "too_many_images: maximo 50 imagenes por batch (enviadas " + images.length + ")" },
      { status: 400 },
    );
  }

  const backendUrl = getBackendUrl();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BATCH_TIMEOUT_MS);

  try {
    const r = await fetch(`${backendUrl}/translate/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, images }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store, must-revalidate",
        "x-proxy-backend": backendUrl,
        "x-proxy-latency-ms": String(r.headers.get("x-process-time") ?? ""),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        success: false,
        error: isAbort
          ? "batch_timeout: el backend tardo mas de 10 min en responder"
          : `backend_unreachable: ${msg}`,
        hint: "Asegurate de que manga-api este corriendo en localhost:8000.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  return NextResponse.json(
    {
      endpoint: "/api/translate/batch",
      methods: ["POST"],
      description: "Parallel batch manga translation (up to 50 images).",
      backend_url: getBackendUrl(),
      request: {
        method: "POST",
        content_type: "application/json",
        body: {
          images: ["<base64-1>", "<base64-2>", "..."],
          target_lang: "es",
          source_lang: "auto",
          detector: "ctd",
          ocr: "manga_ocr",
          translator: "groq",
          inpainter: "lama",
          renderer: "manga2eng",
          font_family: "comic",
        },
      },
    },
    { headers: { "cache-control": "no-store, must-revalidate" } },
  );
}
