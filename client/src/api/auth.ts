import api from './client'

export interface AuthState {
  authenticated:  boolean
  username:       string | null
  /** True when the server is running with AUTH_ENABLED=false */
  auth_disabled?: boolean
}

export const authApi = {
  /**
   * Current session state. Returns `authenticated: false` rather than throwing
   * on 401, because "not signed in" is the expected answer on first load, not
   * an error worth surfacing to the user.
   */
  me: async (): Promise<AuthState> => {
    try {
      const res = await api.get<AuthState>('/auth/me')
      return res.data
    } catch {
      return { authenticated: false, username: null }
    }
  },

  login: async (username: string, password: string): Promise<AuthState> => {
    const res = await api.post<AuthState>('/auth/login', { username, password })
    return res.data
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout')
  },
}
