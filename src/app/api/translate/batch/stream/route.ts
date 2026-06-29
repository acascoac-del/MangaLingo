import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getBackendUrl } from "@/lib/backend-url";

const BATCH_TIMEOUT_MS = 600_000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: NextRequest) {
  let payload: { images?: unknown[]; [key: string]: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ type: "complete", success: false, error: "invalid_json" }),
      { status: 400, headers: { "content-type": "application/x-ndjson", ...CORS_HEADERS } },
    );
  }

  const images = Array.isArray(payload?.images) ? payload.images : null;
  if (!images || images.length === 0) {
    return new Response(
      JSON.stringify({ type: "complete", success: false, error: "missing_images" }),
      { status: 400, headers: { "content-type": "application/x-ndjson", ...CORS_HEADERS } },
    );
  }
  if (images.length > 50) {
    return new Response(
      JSON.stringify({ type: "complete", success: false, error: "too_many_images" }),
      { status: 400, headers: { "content-type": "application/x-ndjson", ...CORS_HEADERS } },
    );
  }

  const backendUrl = getBackendUrl();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BATCH_TIMEOUT_MS);

  try {
    const r = await fetch(`${backendUrl}/translate/batch/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, images }),
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { "content-type": r.headers.get("content-type") ?? "application/json", ...CORS_HEADERS },
      });
    }

    return new Response(r.body, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store, must-revalidate",
        "x-proxy-backend": backendUrl,
        ...CORS_HEADERS,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort");
    return new Response(
      JSON.stringify({
        type: "complete",
        success: false,
        error: isAbort ? "batch_timeout: el backend tardo mas de 10 min" : `backend_unreachable: ${msg}`,
      }),
      { status: 502, headers: { "content-type": "application/x-ndjson", ...CORS_HEADERS } },
    );
  } finally {
    clearTimeout(t);
  }
}
