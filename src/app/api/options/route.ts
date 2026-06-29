import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBackendUrl } from '@/lib/backend-url';

const BACKEND_URL = getBackendUrl();

// CachÃ© 30s: las opciones del backend cambian muy rara vez; el frontend las pide al cargar.
let cached: { ts: number; payload: unknown } | null = null;
const TTL_MS = 30_000;

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.ts > TTL_MS) {
    try {
      const r = await fetch(`${BACKEND_URL}/options`, { cache: 'no-store' });
      const data = await r.json();
      cached = { ts: now, payload: data };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }
  return NextResponse.json(cached.payload, {
    headers: {
      'cache-control': 'public, max-age=30, stale-while-revalidate=300',
    },
  });
}
