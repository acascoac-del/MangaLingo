# Dockerfile para el frontend Next.js de MangaLingo
# Multi-stage build: build → runtime (imagen final más chica)

# ============ Stage 1: Build ============
FROM node:20-slim AS builder

WORKDIR /app

# Instalar bun
RUN npm install -g bun

# Copiar package.json y lockfile primero (mejor caching)
COPY package.json bun.lock* package-lock.json* ./

# Instalar dependencias
RUN bun install --frozen-lockfile || bun install

# Copiar el resto del código
COPY . .

# Eliminar carpetas que no son parte del frontend y pueden romper el build
# (examples/ importa socket.io-client que no está instalado)
RUN rm -rf examples mini-services upload skills download scripts extension-src tool-results .zscripts 2>/dev/null || true

# Variables de entorno para el build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build de Next.js (standalone output)
RUN bun run build

# ============ Stage 2: Runtime ============
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Instalar bun en runtime (para scripts si hace falta) + curl para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && npm install -g bun

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copiar archivos del build standalone
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Cambiar a usuario no-root
USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Next.js standalone server
CMD ["node", "server.js"]
