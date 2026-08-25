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

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    const status = err.response?.status ?? null

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
