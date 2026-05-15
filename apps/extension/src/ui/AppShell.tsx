import type { ComponentChildren } from "preact"
import { Home, Settings as SettingsIcon, Moon, Sun } from "lucide-preact"
import type { Theme } from "@focus-quote/shared"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

export type AppPage = "home" | "options" | "session-detail"

interface AppShellProps {
  page: AppPage
  theme?: Theme
  onToggleTheme?: () => void
  children: ComponentChildren
  rightSlot?: ComponentChildren
}

const openOptions = () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  } else {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/options/index.html"),
    })
  }
}

const openNewtab = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/newtab/index.html") })
}

export function AppShell({
  page,
  theme,
  onToggleTheme,
  children,
  rightSlot,
}: AppShellProps) {
  return (
    <div class="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-body">
      <AppNavBar
        page={page}
        theme={theme}
        onToggleTheme={onToggleTheme}
        rightSlot={rightSlot}
      />
      <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

interface NavBarProps {
  page: AppPage
  theme?: Theme
  onToggleTheme?: () => void
  rightSlot?: ComponentChildren
}

export function AppNavBar({
  page,
  theme,
  onToggleTheme,
  rightSlot,
}: NavBarProps) {
  return (
    <header class="flex shrink-0 items-center justify-between border-b border-hairline bg-surface px-6 py-3">
      <div class="flex items-center gap-6">
        <span class="text-sm font-semibold tracking-tight text-ink">
          FocusQuote
        </span>
        <nav class="flex items-center gap-1">
          <NavLink
            label="Home"
            icon={<Home size={14} />}
            active={page === "home" || page === "session-detail"}
            onClick={page === "options" ? openNewtab : undefined}
          />
          <NavLink
            label="Options"
            icon={<SettingsIcon size={14} />}
            active={page === "options"}
            onClick={page !== "options" ? openOptions : undefined}
          />
        </nav>
      </div>
      <div class="flex items-center gap-2">
        {rightSlot}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            class="rounded-md p-2 text-mute transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        )}
      </div>
    </header>
  )
}

function NavLink({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ComponentChildren
  active: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-current={active ? "page" : undefined}
      class={cx(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70",
        active
          ? "text-ink"
          : "text-mute hover:bg-surface-soft hover:text-body",
        active && "after:mt-1 after:block after:h-0.5 after:w-full after:rounded-full after:bg-primary",
        !onClick && "cursor-default",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
