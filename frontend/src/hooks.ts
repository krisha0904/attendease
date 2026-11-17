import { useCallback, useEffect, useRef, useState } from 'react'

export function useReloadable<T>(load: () => Promise<T>, key: string, initialData: T | null = null) {
  const loadRef = useRef(load)
  const [data, setData] = useState<T | null>(initialData)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadCounter, setReloadCounter] = useState(0)
  const reload = useCallback(() => setReloadCounter((number) => number + 1), [])

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    let active = true
    void loadRef.current().then((result) => {
      if (active) {
        setData(result)
        setError('')
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'The request could not be completed.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [key, reloadCounter])

  return { data, setData, error, setError, loading, reload }
}

export function useClock() {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return now
}
