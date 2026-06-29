import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBackendUrl } from '@/lib/backend-url';

const BACKEND_URL = getBackendUrl();

// CachÃ© corta para evitar martillar al backend en cada polling del frontend (10s).
// Mantener dinÃ¡mico (runtime nodejs) para que no se intente prerenderizar.
let cached: { ts: number; payload: unknown } | null = null;
const TTL_MS = 3_000;

async function probeBackend() {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const r = await fetch(`${BACKEND_URL}/health`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    const data = await r.json();
    return {
      ok: r.ok,
      ms: Date.now() - t0,
      payload: { ...data, frontend: 'ok' },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      ms: Date.now() - t0,
      payload: {
        status: 'degraded',
        frontend: 'ok',
        backend: 'down',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.ts > TTL_MS) {
    const { payload } = await probeBackend();
    cached = { ts: now, payload };
  }
  const body = cached.payload as Record<string, unknown>;
  return NextResponse.json(body, {
    headers: {
      'cache-control': 'no-store, must-revalidate',
      'x-frontend-health': 'nodejs',
      'x-backend-url': BACKEND_URL,
    },
  });
}
