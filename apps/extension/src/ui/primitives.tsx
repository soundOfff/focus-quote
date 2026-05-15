import type { ComponentChildren } from "preact"
import { useLayoutEffect, useRef, useState } from "preact/hooks"
import { Check } from "lucide-preact"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline"
type ButtonSize = "sm" | "md"

interface ButtonProps extends preact.JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: "button" | "submit" | "reset"
  disabled?: boolean
}

interface NativeSelectProps
  extends preact.JSX.SelectHTMLAttributes<HTMLSelectElement> {}

export function NativeSelect({ class: className, ...props }: NativeSelectProps) {
  return (
    <select
      class={cx(
        "h-9 w-full appearance-auto rounded-md border border-hairline-soft bg-canvas px-2 text-sm leading-5 text-ink align-middle outline-none focus:ring-1 focus:ring-focus-ring/70",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  )
}

export function Button({
  variant = "secondary",
  size = "md",
  class: className,
  type = "button",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-primary text-ink hover:bg-primary-pressed"
      : variant === "outline"
        ? "border border-hairline bg-surface text-body hover:bg-surface-soft"
        : variant === "ghost"
          ? "bg-transparent text-body hover:bg-surface-soft"
          : "bg-surface-soft text-ink hover:bg-hairline/50"

  const sizeClass =
    size === "sm"
      ? "h-8 min-h-8 px-3 text-xs"
      : "h-10 min-h-10 px-4 text-sm"

  return (
    <button
      type={type}
      class={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variantClass,
        sizeClass,
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  )
}

interface SurfaceProps {
  children: ComponentChildren
  class?: string
}

export function Surface({ children, class: className }: SurfaceProps) {
  return (
    <section class={cx("rounded-md border border-hairline bg-surface p-5", className)}>
      {children}
    </section>
  )
}

interface ListRowProps {
  children: ComponentChildren
  class?: string
}

export function ListRow({ children, class: className }: ListRowProps) {
  return (
    <div
      class={cx(
        "flex items-start gap-2 rounded-md border border-hairline-soft bg-surface-doc px-2 py-1.5 transition-colors hover:bg-surface-soft/60",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string
  subtitle?: string
  icon?: ComponentChildren
  action?: ComponentChildren
}) {
  return (
    <header class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-ink">
          {icon}
          <span class="text-balance">{title}</span>
        </h2>
        {subtitle && <p class="mt-1 text-xs leading-relaxed text-mute">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info"

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ComponentChildren
  tone?: BadgeTone
}) {
  const toneClass =
    tone === "success"
      ? "bg-accent-green-soft text-accent-green"
      : tone === "danger"
        ? "bg-accent-red-soft text-accent-red"
        : tone === "warning"
          ? "bg-primary/20 text-ink"
          : tone === "info"
            ? "bg-accent-blue-soft text-link-blue"
            : "bg-surface-soft text-body"
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums",
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: ComponentChildren
}) {
  return (
    <div class="rounded-md border border-hairline bg-surface p-8 text-center">
      {icon && <div class="mb-2 flex justify-center text-mute">{icon}</div>}
      <h3 class="text-sm font-semibold text-ink">{title}</h3>
      <p class="mx-auto mt-1 max-w-md text-xs leading-relaxed text-mute">{description}</p>
    </div>
  )
}

interface TabItem<T extends string = string> {
  value: T
  label: string
  icon?: ComponentChildren
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  class: className,
}: {
  items: ReadonlyArray<TabItem<T>>
  value: T
  onChange: (next: T) => void
  class?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  const syncIndicator = () => {
    const root = listRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(`[data-fq-tab="${value}"]`)
    if (!el) return
    const rootRect = root.getBoundingClientRect()
    const tabRect = el.getBoundingClientRect()
    setIndicator({
      left: tabRect.left - rootRect.left,
      width: tabRect.width,
    })
  }

  useLayoutEffect(() => {
    syncIndicator()
    const root = listRef.current
    const ro = root ? new ResizeObserver(syncIndicator) : null
    if (root) ro?.observe(root)
    window.addEventListener("resize", syncIndicator)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", syncIndicator)
    }
  }, [value])

  return (
    <div
      ref={listRef}
      role="tablist"
      class={cx(
        "relative flex flex-wrap items-center gap-1 rounded-md border border-hairline bg-surface p-1",
        className,
      )}
    >
      <span
        aria-hidden
        class="pointer-events-none absolute top-1 z-0 h-[calc(100%-0.5rem)] rounded-md bg-surface-soft motion-safe:transition-[left,width,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        style={{
          left: indicator.width > 0 ? indicator.left : 0,
          width: Math.max(indicator.width, 0),
          opacity: indicator.width > 0 ? 1 : 0,
        }}
      />
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-fq-tab={item.value}
            aria-selected={active}
            onClick={() => onChange(item.value)}
            class={cx(
              "relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70",
              active ? "text-ink" : "text-mute hover:text-body",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  active,
  children,
  class: className,
}: {
  active: boolean
  children: ComponentChildren
  class?: string
}) {
  if (!active) return null
  return <div class={cx("flex flex-col gap-4", className)}>{children}</div>
}

export function Skeleton({
  class: className,
}: {
  class?: string
}) {
  return (
    <div
      class={cx(
        "animate-pulse rounded-md bg-surface-soft",
        className,
      )}
    />
  )
}

export function SkeletonCard({
  lines = 3,
  class: className,
}: {
  lines?: number
  class?: string
}) {
  return (
    <div
      class={cx(
        "flex flex-col gap-2 rounded-md border border-hairline bg-surface p-4",
        className,
      )}
    >
      <Skeleton class="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          class={cx(
            "h-3",
            i === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  )
}

export function Toggle({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean
  onToggle: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      aria-label={ariaLabel}
      class={cx(
        "relative flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent transition-[color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "before:absolute before:inset-0 before:rounded-full before:content-['']",
      )}
    >
      <span
        class={cx(
          "relative h-7 w-12 overflow-hidden rounded-full border px-0.5 transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          enabled
            ? "border-primary bg-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_0_1px_rgba(247,165,1,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_0_3px_rgba(247,165,1,0.22)]"
            : "border-hairline bg-surface-doc dark:bg-surface-soft",
        )}
      >
        <span
          class={cx(
            "absolute left-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border bg-white shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)] transition-[transform,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:border-hairline-soft dark:bg-surface dark:shadow-[0_2px_8px_rgba(0,0,0,0.45)]",
            enabled
              ? "translate-x-5 border-white/70"
              : "translate-x-0 border-hairline",
          )}
        >
          <Check
            size={11}
            strokeWidth={2.5}
            class={cx(
              "motion-safe:transition-[opacity,transform,filter] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]",
              enabled
                ? "text-primary opacity-100 scale-100 blur-none"
                : "pointer-events-none scale-[0.25] opacity-0 blur-[4px]",
            )}
            aria-hidden
          />
        </span>
      </span>
    </button>
  )
}
