/// <reference types="vite/client" />

/**
 * Build-time configuration injected by Vite from .env files.
 * Only variables prefixed with VITE_ are exposed to the browser bundle.
 */
interface ImportMetaEnv {
  /**
   * Absolute base URL of the backend API, e.g. https://api.example.com/api
   *
   * Leave unset for the standard deployment, where the Express server serves
   * this bundle and the API from the same origin and the relative "/api"
   * default applies.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
