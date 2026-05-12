import type { ComponentChildren } from "preact"

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

  const sizeClass = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"

  return (
    <button
      type={type}
      class={cx(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 disabled:cursor-not-allowed disabled:opacity-50",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
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
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={ariaLabel}
      class={cx(
        "relative h-6 w-11 rounded-full border border-hairline bg-surface-soft transition-colors",
        enabled && "bg-primary",
      )}
    >
      <span
        class={cx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-[left] duration-200",
          enabled ? "left-5" : "left-0.5",
        )}
      />
    </button>
  )
}
