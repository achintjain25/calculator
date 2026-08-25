import axios, { AxiosError } from 'axios'

/**
 * In development, Vite proxies /api to the backend on :3000.
 * In production, the Express server serves this bundle itself, so /api is
 * same-origin and the relative base URL still resolves correctly.
 *
 * VITE_API_BASE_URL overrides both, for a split deployment where the client is
 * on a static host and the API lives on another domain.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
})

/**
 * An error thrown by the API layer.
 *
 * The previous interceptor collapsed every failure into a bare `Error`, which
 * silently broke callers using `axios.isAxiosError(err)` to inspect the status
 * — the duplicate-customer (409) branch in AddCustomerPage could never run.
 * Carrying the status and payload keeps that possible without leaking axios
 * internals through the app.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public data: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === null
  }
}

/**
 * Listeners notified when the server rejects a request as unauthenticated.
 *
 * A session can expire at any moment, and without this every page would need
 * its own 401 handling. Instead the app subscribes once and returns to the
 * login screen.
 */
type UnauthenticatedListener = () => void
const unauthenticatedListeners = new Set<UnauthenticatedListener>()

/** Subscribe to 401s. Returns an unsubscribe function for effect cleanup. */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener)
  return () => { unauthenticatedListeners.delete(listener) }
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    const status = err.response?.status ?? null

    // Signed out or session expired. The /auth/ endpoints are excluded: a
    // failed login is a 401 too, and it must surface as a form error rather
    // than remounting the login screen and wiping what was typed.
    const url = err.config?.url ?? ''
    if (status === 401 && !url.startsWith('/auth/')) {
      unauthenticatedListeners.forEach(fn => fn())
    }

    // A request that never got a response almost always means the backend is
    // not running — say so plainly instead of surfacing "Network Error".
    if (status === null) {
      const message = err.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the server. Make sure the backend is running.'
      return Promise.reject(new ApiError(message, null))
    }

    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'An unexpected error occurred'

    return Promise.reject(new ApiError(message, status, err.response?.data))
  }
)

export default api
