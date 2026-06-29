import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone para Docker — genera un server.js autocontenido
  output: 'standalone',

  // Permitir imágenes de cualquier dominio (para la demo)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },

  // Aumentar límite del body para API routes (batch con muchas imágenes base64)
  serverExternalPackages: [],

  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Allows larger payloads to pass through middleware without throwing 400
    // Fixes: Request body exceeded 10MB for /api/translate/batch/stream
    middlewareClientMaxBodySize: '50mb',
  },

};

export default nextConfig;
