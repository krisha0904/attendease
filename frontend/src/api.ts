import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const ACCESS_KEY = 'attendease_access_token'
const REFRESH_KEY = 'attendease_refresh_token'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
  timeout: 30_000,
})

export function saveTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem(ACCESS_KEY, accessToken)
  sessionStorage.setItem(REFRESH_KEY, refreshToken)
}

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_KEY)
}

export function clearTokens() {
  sessionStorage.removeItem(ACCESS_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
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
    const refreshToken = sessionStorage.getItem(REFRESH_KEY)
    if (
      error.response?.status !== 401
      || !request
      || request.retried
      || request.url?.startsWith('/auth/')
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
