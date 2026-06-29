import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware global para CORS en todas las rutas /api/*.
 * Maneja preflight (OPTIONS) correctamente — Next.js headers() NO maneja OPTIONS.
 */
export function middleware(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // For actual requests, add CORS headers to the response
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export const config = {
  matcher: [
    '/api/translate',
    '/api/health',
    '/api/options'
  ],
};
