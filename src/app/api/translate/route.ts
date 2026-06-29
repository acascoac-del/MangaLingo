import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes limit

// Note: Next.js Pages router uses config for sizeLimit. 
// For App Router, we still include it as requested, but it may be ignored by Next.js 13+ in favor of server limits.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "256mb",
    },
  },
};

import { getBackendUrl } from "@/lib/backend-url";

async function callBackend(path: string, init: RequestInit, timeoutMs = 240_000): Promise<Response> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

function passthroughHeaders(upstream: Response): HeadersInit {
  const h: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store, must-revalidate",
  };
  const lp = upstream.headers.get("x-process-time");
  if (lp) h["x-proxy-latency-ms"] = lp;
  return h;
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";

  try {
    if (ct.includes("application/json")) {
      const body = await req.text();
      const r = await callBackend("/translate/json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const text = await r.text();
      return new NextResponse(text, { status: r.status, headers: passthroughHeaders(r) });
    }

    // multipart/form-data (upload tradicional)
    const form = await req.formData();
    const r = await callBackend("/translate", {
      method: "POST",
      body: form as unknown as BodyInit,
    });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: passthroughHeaders(r) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        success: false,
        error: isAbort
          ? "translate_timeout: el backend tardo mas de 240s en responder"
          : `backend_unreachable: ${msg}`,
        hint: "Asegurate de que manga-api este corriendo en localhost:8000 (powershell -ExecutionPolicy Bypass -File scripts\\start-manga-api.ps1).",
      },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      endpoint: "/api/translate",
      methods: ["POST"],
      description: "Single-request manga translation pipeline.",
      backend_url: getBackendUrl(),
      accepts: [
        "multipart/form-data con image + target_lang + source_lang + detector + ocr + translator + inpainter + renderer + font_family",
        "application/json con { image: <base64>, target_lang, source_lang, detector, ocr, translator, inpainter, renderer, font_family, mimo_token? }",
      ],
      default_translator: "groq (cloud); alternativas: xiaomi, xiaomi_pro, ollama",
    },
    { headers: { "cache-control": "no-store, must-revalidate" } },
  );
}
