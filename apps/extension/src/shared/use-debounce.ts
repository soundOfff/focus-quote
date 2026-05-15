import { useEffect, useRef, useState } from "preact/hooks"

/**
 * Hook that debounces a callback, calling it after `delayMs` of inactivity.
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => unknown,
  delayMs: number,
): (...args: Args) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (...args: Args) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => callback(...args), delayMs)
  }
}
