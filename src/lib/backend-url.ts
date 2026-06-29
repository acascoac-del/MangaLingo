/**
 * Shared utility to get the backend (manga-api) URL.
 * Eliminates duplication across API route files.
 */
export function getBackendUrl(): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.NODE_ENV === 'production') return 'http://manga-api:8000';
  return 'http://localhost:8000';
}
