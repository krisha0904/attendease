import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const ACCESS_KEY = 'attendease_access_token'
const REFRESH_KEY = 'attendease_refresh_token'
const USER_KEY = 'attendease_user'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
  timeout: 30_000,
})

export function saveTokens(accessToken: string, refreshToken: string) {
  try {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    sessionStorage.setItem(ACCESS_KEY, accessToken)
    sessionStorage.setItem(REFRESH_KEY, refreshToken)
  } catch {
    // Ignore storage quota or access errors
  }
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY) || sessionStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function saveUser<T = unknown>(user: T) {
  try {
    const serialized = JSON.stringify(user)
    localStorage.setItem(USER_KEY, serialized)
    sessionStorage.setItem(USER_KEY, serialized)
  } catch {
    // Ignore storage errors
  }
}

export function getStoredUser<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(ACCESS_KEY)
    sessionStorage.removeItem(REFRESH_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

let refreshRequest: Promise<string | null> | null = null

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { retried?: boolean }) | undefined
    const refreshToken = getRefreshToken()
    const url = request?.url || ''
    const isAuthLoginOrRefresh =
      url.includes('/auth/login') ||
      url.includes('/auth/admin-login') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/otp/')

    if (
      error.response?.status !== 401
      || !request
      || request.retried
      || isAuthLoginOrRefresh
      || !refreshToken
    ) {
      return Promise.reject(error)
    }

    request.retried = true
    refreshRequest ??= axios
      .post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 15_000 })
      .then(({ data }: { data: { access_token: string; refresh_token: string } }) => {
        saveTokens(data.access_token, data.refresh_token)
        return data.access_token
      })
      .catch(() => {
        clearTokens()
        window.dispatchEvent(new Event('attendease:logout'))
        return null
      })
      .finally(() => {
        refreshRequest = null
      })

    const token = await refreshRequest
    if (!token) return Promise.reject(error)
    request.headers.Authorization = `Bearer ${token}`
    return api(request)
  },
)

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown } | undefined
    if (typeof data?.detail === 'string') return data.detail
    return error.message || 'The request could not be completed.'
  }
  if (error instanceof Error) return error.message
  return 'The request could not be completed.'
}

export async function fetchJson<T>(path: string, params?: Record<string, string>) {
  const { data } = await api.get<T>(path, { params })
  return data
}
