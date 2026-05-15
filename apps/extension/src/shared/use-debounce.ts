import { useEffect, useRef, useState } from "preact/hooks"

/**
 * Hook that debounces a callback, calling it after `delayMs` of inactivity.
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delayMs: number,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => callback(...args), delayMs)
  }
}
