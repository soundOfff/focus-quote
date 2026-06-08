import { createContext } from "preact"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { ComponentChildren } from "preact"
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-preact"

type ToastKind = "success" | "error" | "info"

/** An optional inline action button (e.g. "View report"). */
interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  action?: ToastAction
}

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void
  error: (message: string, opts?: ToastOptions) => void
  info: (message: string, opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

const TOAST_TTL_MS = 2500
// Actionable toasts linger longer so the user has time to reach the button.
const TOAST_ACTION_TTL_MS = 8000

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(1)

  const push = useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      const id = idRef.current++
      setItems((prev) => [...prev, { id, kind, message, action: opts?.action }])
      window.setTimeout(
        () => {
          setItems((prev) => prev.filter((t) => t.id !== id))
        },
        opts?.action ? TOAST_ACTION_TTL_MS : TOAST_TTL_MS,
      )
    },
    [],
  )

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, opts) => push("success", m, opts),
      error: (m, opts) => push("error", m, opts),
      info: (m, opts) => push("info", m, opts),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        class="pointer-events-none fixed bottom-4 right-4 z-[2147483640] flex flex-col gap-2"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: () => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const Icon =
    item.kind === "success"
      ? CheckCircle2
      : item.kind === "error"
        ? AlertTriangle
        : Info
  const toneClass =
    item.kind === "success"
      ? "border-accent-green/40 bg-accent-green-soft text-ink"
      : item.kind === "error"
        ? "border-accent-red/40 bg-accent-red-soft text-ink"
        : "border-hairline bg-surface text-ink"

  return (
    <div
      role="status"
      class={cx(
        "pointer-events-auto flex min-w-[240px] max-w-sm items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition-[opacity,transform] duration-150",
        toneClass,
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
      )}
    >
      <Icon size={16} class="mt-0.5 shrink-0" />
      <p class="min-w-0 flex-1 leading-snug">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick()
            onDismiss()
          }}
          class="ml-1 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-link-blue hover:text-link-blue/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        class="ml-1 rounded p-0.5 text-mute hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback no-op so call sites are safe outside a provider.
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    }
  }
  return ctx
}
